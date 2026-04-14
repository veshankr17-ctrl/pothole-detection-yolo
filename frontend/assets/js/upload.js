const uploadInput = document.getElementById("upload-input");
const uploadPreview = document.getElementById("upload-preview");
const uploadOverlay = document.getElementById("upload-overlay");
const uploadStateEl = document.getElementById("upload-state");
const gpsEl = document.getElementById("gps-state");
const detectUploadBtn = document.getElementById("detect-upload-btn");
const saveUploadBtn = document.getElementById("save-upload-btn");
const confidenceRange = document.getElementById("upload-confidence-range");
const confidenceValue = document.getElementById("upload-confidence-value");

const uploadCtx = uploadOverlay.getContext("2d");

let uploadedImageBase64 = null;
let uploadedDetectionResult = null;
let latestLocation = null;

function setText(el, text, cls) {
  el.textContent = text;
  el.className = `status ${cls || ""}`;
}

function getThreshold() {
  const value = Number(confidenceRange?.value || 0.5);
  return Math.min(0.9, Math.max(0.35, value));
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function drawUploadDetections(detections) {
  if (!uploadPreview.naturalWidth || !uploadPreview.naturalHeight) return;
  uploadOverlay.width = uploadPreview.clientWidth;
  uploadOverlay.height = uploadPreview.clientHeight;
  const scaleX = uploadOverlay.width / uploadPreview.naturalWidth;
  const scaleY = uploadOverlay.height / uploadPreview.naturalHeight;
  uploadCtx.clearRect(0, 0, uploadOverlay.width, uploadOverlay.height);
  uploadCtx.lineWidth = 2;
  uploadCtx.font = "14px Arial";
  for (const d of detections) {
    const x = d.x1 * scaleX;
    const y = d.y1 * scaleY;
    const w = (d.x2 - d.x1) * scaleX;
    const h = (d.y2 - d.y1) * scaleY;
    uploadCtx.strokeStyle = "#ef4444";
    uploadCtx.fillStyle = "#ef4444";
    uploadCtx.strokeRect(x, y, w, h);
    uploadCtx.fillText(`${d.class_name} ${Math.round(d.confidence * 100)}%`, x, Math.max(y - 5, 12));
  }
}

function startLocationTracking() {
  if (!navigator.geolocation) {
    setText(gpsEl, "Geolocation not supported", "warn");
    return;
  }
  navigator.geolocation.watchPosition(
    (pos) => {
      latestLocation = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        location_accuracy: pos.coords.accuracy,
      };
      setText(
        gpsEl,
        `GPS: ${latestLocation.latitude.toFixed(5)}, ${latestLocation.longitude.toFixed(5)} (±${Math.round(latestLocation.location_accuracy)}m)`,
        "ok"
      );
    },
    () => setText(gpsEl, "GPS permission denied; report will save without map pin.", "warn"),
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 3000 }
  );
}

async function saveUploadedReport() {
  if (!uploadedImageBase64 || !uploadedDetectionResult || !uploadedDetectionResult.has_pothole) {
    setText(uploadStateEl, "Detect pothole in uploaded image first.", "warn");
    return;
  }
  const payload = {
    image_base64: uploadedImageBase64,
    confidence: uploadedDetectionResult.max_confidence,
    detections_count: uploadedDetectionResult.detections.length,
    detected_at: new Date().toISOString(),
    ...latestLocation,
  };
  try {
    const result = await apiPost("/reports", payload);
    setText(uploadStateEl, `Uploaded report saved: ${result.report_id}`, "ok");
  } catch {
    setText(uploadStateEl, "Failed to save uploaded report.", "err");
  }
}

uploadInput.addEventListener("change", async () => {
  const file = uploadInput.files?.[0];
  if (!file) {
    uploadedImageBase64 = null;
    setText(uploadStateEl, "No uploaded image selected.", "warn");
    return;
  }
  try {
    uploadedImageBase64 = await fileToBase64(file);
    uploadedDetectionResult = null;
    saveUploadBtn.disabled = true;
    uploadPreview.src = uploadedImageBase64;
    uploadPreview.style.display = "block";
    uploadOverlay.style.display = "block";
    uploadCtx.clearRect(0, 0, uploadOverlay.width, uploadOverlay.height);
    setText(uploadStateEl, `Image selected: ${file.name}. Click detect.`, "ok");
  } catch {
    setText(uploadStateEl, "Could not read selected image.", "err");
  }
});

detectUploadBtn.addEventListener("click", async () => {
  const selectedFile = uploadInput.files?.[0];
  if (!selectedFile) {
    setText(uploadStateEl, "Please choose an image first.", "warn");
    return;
  }
  if (!uploadedImageBase64) {
    uploadedImageBase64 = await fileToBase64(selectedFile);
  }
  try {
    const result = await apiPost("/predict", {
      image_base64: uploadedImageBase64,
      confidence_threshold: getThreshold(),
    });
    uploadedDetectionResult = result;
    setTimeout(() => drawUploadDetections(result.detections), 80);
    if (result.has_pothole) {
      saveUploadBtn.disabled = false;
      setText(uploadStateEl, `Pothole detected (${Math.round(result.max_confidence * 100)}%). Click save.`, "warn");
    } else {
      saveUploadBtn.disabled = true;
      setText(uploadStateEl, "No pothole detected in uploaded image.", "ok");
    }
  } catch {
    setText(uploadStateEl, "Upload detection failed. Check backend/API.", "err");
  }
});

saveUploadBtn.addEventListener("click", saveUploadedReport);

if (confidenceRange && confidenceValue) {
  confidenceValue.textContent = Number(confidenceRange.value).toFixed(2);
  confidenceRange.addEventListener("input", () => {
    confidenceValue.textContent = Number(confidenceRange.value).toFixed(2);
  });
}

startLocationTracking();
