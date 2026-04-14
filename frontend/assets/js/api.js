const DEFAULT_API_BASE_URL = "https://pothole-detection-yolo.onrender.com";
const API_BASE_URL = localStorage.getItem("API_BASE_URL") || DEFAULT_API_BASE_URL;

async function apiPost(path, body) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
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
