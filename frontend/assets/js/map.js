const map = L.map("map").setView([20.5937, 78.9629], 5);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap",
}).addTo(map);

async function loadPoints() {
  const points = await apiGet("/map-points");
  if (!points.length) {
    document.getElementById("map-status").textContent = "No markers yet. Save reports from detection pages.";
    return;
  }
  let confidenceSum = 0;
  for (const p of points) {
    confidenceSum += p.confidence || 0;
    const marker = L.circleMarker([p.latitude, p.longitude], {
      radius: 8,
      color: "#0ea5e9",
      weight: 2,
      fillColor: "#38bdf8",
      fillOpacity: 0.7,
    }).addTo(map);
    const imageUrl = `${API_BASE_URL}${p.image_path}`;
    marker.bindPopup(`
      <div style="min-width:220px;">
        <b>Report:</b> ${p.id}<br />
        <b>Confidence:</b> ${(p.confidence * 100).toFixed(1)}%<br />
        <b>Time:</b> ${new Date(p.detected_at).toLocaleString()}<br />
        <img src="${imageUrl}" alt="pothole" style="width:160px;border-radius:8px;margin-top:6px;" />
      </div>
    `);
  }
  map.setView([points[0].latitude, points[0].longitude], 14);
  document.getElementById("total-markers").textContent = String(points.length);
  document.getElementById("avg-confidence").textContent = `${((confidenceSum / points.length) * 100).toFixed(1)}%`;
  document.getElementById("latest-time").textContent = new Date(points[0].detected_at).toLocaleString();
  document.getElementById("map-status").textContent = "Markers loaded successfully.";
}

loadPoints().catch((e) => {
  document.getElementById("map-status").textContent = `Failed loading map points: ${e.message}`;
});
