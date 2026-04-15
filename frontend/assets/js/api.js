const DEFAULT_API_BASE_URL = "/api";
const DIRECT_RENDER_API_BASE_URL = "https://pothole-detection-yolo.onrender.com";
const NETWORK_TIMEOUT_MS = 50000;
const TRANSIENT_WAIT_MS = 2200;
const LOCAL_REPORTS_KEY = "LOCAL_POTHOLE_REPORTS_V1";
let API_BASE_URL = resolveApiBaseUrl();

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeBaseUrl(rawUrl) {
  if (!rawUrl) return null;
  if (rawUrl.startsWith("/")) return rawUrl.replace(/\/+$/, "");
  try {
    const parsed = new URL(rawUrl);
    if (window.location.protocol === "https:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

function resolveApiBaseUrl() {
  const stored = localStorage.getItem("API_BASE_URL");
  const sanitizedStored = sanitizeBaseUrl(stored);
  if (sanitizedStored) return sanitizedStored;
  if (stored) localStorage.removeItem("API_BASE_URL");
  return DEFAULT_API_BASE_URL;
}

function isNetworkLevelError(err) {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return msg.includes("failed to fetch") || msg.includes("networkerror") || msg.includes("load failed");
}

async function fetchWithTimeout(url, init, timeoutMs = NETWORK_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/** Downscale large camera/phone images so JSON + YOLO on Render free tier does not time out. */
function compressDataUrlForApi(dataUrl, maxSide = 960, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (!w || !h) {
          reject(new Error("Invalid image dimensions"));
          return;
        }
        const scale = Math.min(1, maxSide / Math.max(w, h));
        const tw = Math.max(1, Math.round(w * scale));
        const th = Math.max(1, Math.round(h * scale));
        const canvas = document.createElement("canvas");
        canvas.width = tw;
        canvas.height = th;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, tw, th);
        resolve(canvas.toDataURL("image/jpeg", quality));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error("Could not load image for compression"));
    img.src = dataUrl;
  });
}

async function apiPost(path, body) {
  const urlsToTry =
    API_BASE_URL === DEFAULT_API_BASE_URL
      ? [API_BASE_URL, DIRECT_RENDER_API_BASE_URL]
      : [API_BASE_URL, DEFAULT_API_BASE_URL, DIRECT_RENDER_API_BASE_URL];
  let lastError = null;
  for (const baseUrl of urlsToTry) {
    try {
      let res = await fetchWithTimeout(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      // Render free tier can respond transiently while waking up.
      if (res.status === 502 || res.status === 503 || res.status === 504) {
        await delay(TRANSIENT_WAIT_MS);
        res = await fetchWithTimeout(`${baseUrl}${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      if (!res.ok) {
        throw new Error(await res.text());
      }
      if (baseUrl !== API_BASE_URL) {
        API_BASE_URL = baseUrl;
        localStorage.setItem("API_BASE_URL", baseUrl);
      }
      return res.json();
    } catch (err) {
      lastError = err;
      // Always continue to next fallback URL; /api may fail if proxy isn't active yet.
      continue;
    }
  }
  const errMsg = lastError instanceof Error ? lastError.message : String(lastError || "Unknown request error");
  throw new Error(`API request failed via ${API_BASE_URL}: ${errMsg}`);
}

async function apiGet(path) {
  let res;
  const urlsToTry =
    API_BASE_URL === DEFAULT_API_BASE_URL
      ? [API_BASE_URL, DIRECT_RENDER_API_BASE_URL]
      : [API_BASE_URL, DEFAULT_API_BASE_URL, DIRECT_RENDER_API_BASE_URL];
  let lastErr = null;
  for (const baseUrl of urlsToTry) {
    try {
      res = await fetchWithTimeout(`${baseUrl}${path}`, { method: "GET" });
      if (res.status === 502 || res.status === 503 || res.status === 504) {
        await delay(TRANSIENT_WAIT_MS);
        res = await fetchWithTimeout(`${baseUrl}${path}`, { method: "GET" });
      }
      if (!res.ok) {
        throw new Error(await res.text());
      }
      if (baseUrl !== API_BASE_URL) {
        API_BASE_URL = baseUrl;
        localStorage.setItem("API_BASE_URL", API_BASE_URL);
      }
      return res.json();
    } catch (err) {
      lastErr = err;
      if (!isNetworkLevelError(err) && baseUrl !== DEFAULT_API_BASE_URL) {
        break;
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr || "API get failed"));
}

function getLocalReports() {
  try {
    const raw = localStorage.getItem(LOCAL_REPORTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setLocalReports(reports) {
  localStorage.setItem(LOCAL_REPORTS_KEY, JSON.stringify(reports.slice(0, 250)));
}

function saveLocalReport(payload) {
  const localReports = getLocalReports();
  const reportId = `local-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const report = {
    id: reportId,
    image_path: payload.image_base64,
    confidence: payload.confidence,
    detections_count: payload.detections_count,
    latitude: payload.latitude ?? null,
    longitude: payload.longitude ?? null,
    location_accuracy: payload.location_accuracy ?? null,
    address: payload.address ?? null,
    detected_at: payload.detected_at || new Date().toISOString(),
    created_at: new Date().toISOString(),
    is_local_fallback: true,
  };
  localReports.unshift(report);
  setLocalReports(localReports);
  return { report_id: reportId, is_fallback: true };
}

function getImageUrl(imagePath) {
  if (!imagePath) return "";
  if (imagePath.startsWith("data:")) return imagePath;
  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) return imagePath;
  return `${API_BASE_URL}${imagePath}`;
}

async function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image for local detection"));
    img.src = dataUrl;
  });
}

async function runLocalHeuristicDetection(imageBase64, threshold = 0.35) {
  const image = await loadImageFromDataUrl(imageBase64);
  const maxSide = 640;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const w = Math.max(1, Math.round(image.naturalWidth * scale));
  const h = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;

  const gray = new Uint8Array(w * h);
  let sumGray = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const g = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    gray[p] = g;
    sumGray += g;
  }
  const meanGray = sumGray / (w * h);
  const darkThreshold = Math.max(28, Math.min(95, Math.round(meanGray * 0.62)));

  const cell = 16;
  const cols = Math.ceil(w / cell);
  const rows = Math.ceil(h / cell);
  const active = new Uint8Array(cols * rows);
  const density = new Float32Array(cols * rows);

  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      let dark = 0;
      let total = 0;
      const x0 = cx * cell;
      const y0 = cy * cell;
      const x1 = Math.min(w, x0 + cell);
      const y1 = Math.min(h, y0 + cell);
      for (let y = y0; y < y1; y++) {
        let idx = y * w + x0;
        for (let x = x0; x < x1; x++, idx++) {
          if (gray[idx] <= darkThreshold) dark++;
          total++;
        }
      }
      const ratio = total ? dark / total : 0;
      const ci = cy * cols + cx;
      density[ci] = ratio;
      if (ratio > 0.24) active[ci] = 1;
    }
  }

  const visited = new Uint8Array(cols * rows);
  const detections = [];
  const imageArea = w * h;

  for (let i = 0; i < active.length; i++) {
    if (!active[i] || visited[i]) continue;
    const queue = [i];
    visited[i] = 1;
    let minCx = cols;
    let minCy = rows;
    let maxCx = 0;
    let maxCy = 0;
    let weight = 0;
    let count = 0;
    while (queue.length) {
      const cur = queue.pop();
      const cy = Math.floor(cur / cols);
      const cx = cur % cols;
      minCx = Math.min(minCx, cx);
      minCy = Math.min(minCy, cy);
      maxCx = Math.max(maxCx, cx);
      maxCy = Math.max(maxCy, cy);
      weight += density[cur];
      count++;
      for (let ny = cy - 1; ny <= cy + 1; ny++) {
        for (let nx = cx - 1; nx <= cx + 1; nx++) {
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const ni = ny * cols + nx;
          if (!active[ni] || visited[ni]) continue;
          visited[ni] = 1;
          queue.push(ni);
        }
      }
    }

    const x1 = minCx * cell;
    const y1 = minCy * cell;
    const x2 = Math.min(w, (maxCx + 1) * cell);
    const y2 = Math.min(h, (maxCy + 1) * cell);
    const bw = Math.max(1, x2 - x1);
    const bh = Math.max(1, y2 - y1);
    const areaRatio = (bw * bh) / imageArea;
    const aspect = bw / bh;
    if (count < 4 || areaRatio < 0.0008 || areaRatio > 0.55 || aspect > 18 || aspect < 0.06) continue;

    const darkRatio = weight / Math.max(1, count);
    const conf = Math.max(threshold, Math.min(0.91, 0.28 + darkRatio * 0.9 + areaRatio * 0.55));
    detections.push({
      x1: Number((x1 / scale).toFixed(2)),
      y1: Number((y1 / scale).toFixed(2)),
      x2: Number((x2 / scale).toFixed(2)),
      y2: Number((y2 / scale).toFixed(2)),
      confidence: Number(conf.toFixed(4)),
      class_id: 0,
      class_name: "pothole",
      area_ratio: Number(areaRatio.toFixed(6)),
    });
  }

  detections.sort((a, b) => b.confidence - a.confidence);
  const top = detections.slice(0, 8);
  return {
    has_pothole: top.length > 0,
    max_confidence: top.length ? top[0].confidence : 0,
    detections: top,
    rejected_count: 0,
    is_fallback: true,
  };
}

async function predictPothole(imageBase64, confidenceThreshold) {
  try {
    return await apiPost("/predict", {
      image_base64: imageBase64,
      confidence_threshold: confidenceThreshold,
    });
  } catch {
    return runLocalHeuristicDetection(imageBase64, confidenceThreshold);
  }
}

async function saveReportData(payload) {
  try {
    return await apiPost("/reports", payload);
  } catch {
    return saveLocalReport(payload);
  }
}

async function fetchReportsMerged() {
  const local = getLocalReports();
  let remote = [];
  try {
    remote = await apiGet("/reports");
  } catch {
    remote = [];
  }
  const combined = [...remote, ...local];
  const seen = new Set();
  return combined
    .filter((r) => {
      if (!r?.id || seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    })
    .sort((a, b) => new Date(b.created_at || b.detected_at).getTime() - new Date(a.created_at || a.detected_at).getTime());
}

async function fetchMapPointsMerged() {
  let points = [];
  try {
    points = await apiGet("/map-points");
  } catch {
    points = [];
  }
  if (points.length) return points;
  const reports = await fetchReportsMerged();
  return reports.filter((r) => r.latitude != null && r.longitude != null);
}
