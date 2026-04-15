const DEFAULT_API_BASE_URL = "https://pothole-detection-yolo.onrender.com";
const API_BASE_URL = localStorage.getItem("API_BASE_URL") || DEFAULT_API_BASE_URL;

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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 50000);
  let res;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json();
}

async function apiGet(path) {
  const res = await fetch(`${API_BASE_URL}${path}`);
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json();
}
