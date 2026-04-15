const DEFAULT_API_BASE_URL = "https://pothole-detection-yolo.onrender.com";
const NETWORK_TIMEOUT_MS = 50000;
const TRANSIENT_WAIT_MS = 2200;
let API_BASE_URL = resolveApiBaseUrl();

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeBaseUrl(rawUrl) {
  if (!rawUrl) return null;
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
    API_BASE_URL === DEFAULT_API_BASE_URL ? [API_BASE_URL] : [API_BASE_URL, DEFAULT_API_BASE_URL];
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
      // Try fallback URL only when failure is network-level or current URL is non-default.
      if (!isNetworkLevelError(err) && baseUrl === DEFAULT_API_BASE_URL) {
        break;
      }
    }
  }
  const errMsg = lastError instanceof Error ? lastError.message : String(lastError || "Unknown request error");
  throw new Error(`API request failed via ${API_BASE_URL}: ${errMsg}`);
}

async function apiGet(path) {
  let res;
  try {
    res = await fetchWithTimeout(`${API_BASE_URL}${path}`, { method: "GET" });
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      await delay(TRANSIENT_WAIT_MS);
      res = await fetchWithTimeout(`${API_BASE_URL}${path}`, { method: "GET" });
    }
  } catch (err) {
    if (API_BASE_URL !== DEFAULT_API_BASE_URL && isNetworkLevelError(err)) {
      API_BASE_URL = DEFAULT_API_BASE_URL;
      localStorage.setItem("API_BASE_URL", API_BASE_URL);
      res = await fetchWithTimeout(`${API_BASE_URL}${path}`, { method: "GET" });
    } else {
      throw err;
    }
  }
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json();
}
