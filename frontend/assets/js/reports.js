const reportsContainer = document.getElementById("reports");
const reportSearch = document.getElementById("report-search");
let allReports = [];

function renderReports(reports) {
  if (!reports.length) {
    reportsContainer.innerHTML = "<p>No reports saved yet. Start live detection first.</p>";
    return;
  }
  reportsContainer.innerHTML = reports
    .map((r) => {
      const imageUrl = `${API_BASE_URL}${r.image_path}`;
      return `
        <div class="card report-card">
          <p><b>Report ID:</b> ${r.id}</p>
          <p><b>Confidence:</b> ${(r.confidence * 100).toFixed(1)}%</p>
          <p><b>Detected at:</b> ${new Date(r.detected_at).toLocaleString()}</p>
          <p><b>Location:</b> ${r.latitude ?? "N/A"}, ${r.longitude ?? "N/A"}</p>
          <img class="report" src="${imageUrl}" alt="pothole frame"/>
        </div>
      `;
    })
    .join("");
}

async function loadReports() {
  allReports = await apiGet("/reports");
  renderReports(allReports);
}

loadReports().catch((e) => {
  reportsContainer.innerHTML = `<p class="err">Failed loading reports: ${e.message}</p>`;
});

if (reportSearch) {
  reportSearch.addEventListener("input", () => {
    const query = reportSearch.value.trim().toLowerCase();
    if (!query) {
      renderReports(allReports);
      return;
    }
    const filtered = allReports.filter((r) => (r.id || "").toLowerCase().includes(query));
    renderReports(filtered);
  });
}
