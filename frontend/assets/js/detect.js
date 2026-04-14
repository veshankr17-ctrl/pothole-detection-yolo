const video = document.getElementById("camera");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");
const stateEl = document.getElementById("detect-state");
const gpsEl = document.getElementById("gps-state");
const saveEl = document.getElementById("save-state");
const startBtn = document.getElementById("start-btn");
const stopBtn = document.getElementById("stop-btn");
const confidenceRange = document.getElementById("confidence-range");
const confidenceValue = document.getElementById("confidence-value");
const uploadInput = document.getElementById("upload-input");
const uploadPreview = document.getElementById("upload-preview");
const uploadOverlay = document.getElementById("upload-overlay");
const uploadStateEl = document.getElementById("upload-state");
const detectUploadBtn = document.getElementById("detect-upload-btn");
const saveUploadBtn = document.getElementById("save-upload-btn");
const uploadCtx = uploadOverlay ? uploadOverlay.getContext("2d") : null;

let stream = null;
let running = false;
let latestLocation = null;
let lastSavedAt = 0;
let uploadedImageBase64 = null;
let uploadedDetectionResult = null;

const FRAME_INTERVAL_MS = 1200;
const SAVE_COOLDOWN_MS = 5000;

function setText(el, text, cls) {
  el.textContent = text;
  el.className = `status ${cls || ""}`;
}

function getThreshold() {
  const value = Number(confidenceRange?.value || 0.5);
  return Math.min(0.9, Math.max(0.35, value));
}

function getFrameBase64() {
  const temp = document.createElement("canvas");
  temp.width = video.videoWidth;
  temp.height = video.videoHeight;
  const tctx = temp.getContext("2d");
  tctx.drawImage(video, 0, 0, temp.width, temp.height);
  return temp.toDataURL("image/jpeg", 0.8);
}

function drawDetections(detections) {
  canvas.width = video.clientWidth;
  canvas.height = video.clientHeight;
  const scaleX = canvas.width / video.videoWidth;
  const scaleY = canvas.height / video.videoHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineWidth = 2;
  ctx.font = "14px Arial";
  for (const d of detections) {
    const x = d.x1 * scaleX;
    const y = d.y1 * scaleY;
    const w = (d.x2 - d.x1) * scaleX;
    const h = (d.y2 - d.y1) * scaleY;
    ctx.strokeStyle = "#ef4444";
    ctx.fillStyle = "#ef4444";
    ctx.strokeRect(x, y, w, h);
    ctx.fillText(`${d.class_name} ${Math.round(d.confidence * 100)}%`, x, Math.max(y - 5, 12));
  }
}

function drawUploadDetections(detections) {
  if (!uploadPreview || !uploadOverlay || !uploadCtx) return;
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
    uploadCtx.strokeStyle = "#dc2626";
    uploadCtx.fillStyle = "#dc2626";
    uploadCtx.strokeRect(x, y, w, h);
    uploadCtx.fillText(`${d.class_name} ${Math.round(d.confidence * 100)}%`, x, Math.max(y - 5, 12));
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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
    () => setText(gpsEl, "GPS permission denied; reports will save without map pin", "warn"),
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 3000 }
  );
}

async function saveReport(imageBase64, detectionResult) {
  const now = Date.now();
  if (now - lastSavedAt < SAVE_COOLDOWN_MS || detectionResult.max_confidence < 0.55) return;
  lastSavedAt = now;
  const payload = {
    image_base64: imageBase64,
    confidence: detectionResult.max_confidence,
    detections_count: detectionResult.detections.length,
    detected_at: new Date().toISOString(),
    ...latestLocation,
  };
  try {
    const result = await apiPost("/reports", payload);
    setText(saveEl, `Saved report: ${result.report_id}`, "ok");
  } catch {
    setText(saveEl, "Failed to save report", "err");
  }
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
    setText(uploadStateEl, `Uploaded image report saved: ${result.report_id}`, "ok");
  } catch {
    setText(uploadStateEl, "Failed to save uploaded image report.", "err");
  }
}

async function detectionLoop() {
  while (running) {
    if (!video.videoWidth) {
      await new Promise((r) => setTimeout(r, 400));
      continue;
    }
    const imageBase64 = getFrameBase64();
    try {
      const result = await apiPost("/predict", {
        image_base64: imageBase64,
        confidence_threshold: getThreshold(),
      });
      drawDetections(result.detections);
      if (result.has_pothole) {
        setText(stateEl, `Pothole detected (${Math.round(result.max_confidence * 100)}%)`, "warn");
        await saveReport(imageBase64, result);
      } else {
        setText(stateEl, "No pothole detected", "ok");
      }
    } catch {
      setText(stateEl, "Prediction error. Check backend URL/API.", "err");
    }
    await new Promise((r) => setTimeout(r, FRAME_INTERVAL_MS));
  }
}

async function startDetection() {
  stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
  video.srcObject = stream;
  await video.play();
  running = true;
  setText(stateEl, "Live detection started", "ok");
  startLocationTracking();
  detectionLoop();
}

function stopDetection() {
  running = false;
  if (stream) {
    for (const track of stream.getTracks()) track.stop();
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  setText(stateEl, "Detection stopped", "warn");
}

startBtn.addEventListener("click", startDetection);
stopBtn.addEventListener("click", stopDetection);

if (uploadInput && uploadPreview && uploadOverlay && uploadStateEl && detectUploadBtn && saveUploadBtn) {
  uploadInput.addEventListener("change", async () => {
    const file = uploadInput.files?.[0];
    if (!file) {
      uploadedImageBase64 = null;
      setText(uploadStateEl, "No uploaded image selected.", "warn");
      return;
    }
    try {
      uploadedImageBase64 = await fileToBase64(file);
      uploadPreview.src = uploadedImageBase64;
      uploadPreview.style.display = "block";
      uploadOverlay.style.display = "block";
      uploadedDetectionResult = null;
      saveUploadBtn.disabled = true;
      uploadCtx?.clearRect(0, 0, uploadOverlay.width, uploadOverlay.height);
      setText(uploadStateEl, `Image selected: ${file.name}. Click detect.`, "ok");
    } catch {
      uploadedImageBase64 = null;
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
      try {
        uploadedImageBase64 = await fileToBase64(selectedFile);
      } catch {
        setText(uploadStateEl, "Could not read selected image.", "err");
        return;
      }
    }
    try {
      const result = await apiPost("/predict", {
        image_base64: uploadedImageBase64,
        confidence_threshold: getThreshold(),
      });
      uploadedDetectionResult = result;
      // Delay draw slightly to ensure preview dimensions are available.
      setTimeout(() => drawUploadDetections(result.detections), 80);
      if (result.has_pothole) {
        saveUploadBtn.disabled = false;
        setText(
          uploadStateEl,
          `Pothole detected in upload (${Math.round(result.max_confidence * 100)}%). Click save.`,
          "warn"
        );
      } else {
        saveUploadBtn.disabled = true;
        setText(uploadStateEl, "No pothole detected in uploaded image.", "ok");
      }
    } catch {
      setText(uploadStateEl, "Upload detection failed. Check backend/API.", "err");
    }
  });

  saveUploadBtn.addEventListener("click", saveUploadedReport);
}

startLocationTracking();

if (confidenceRange && confidenceValue) {
  confidenceValue.textContent = Number(confidenceRange.value).toFixed(2);
  confidenceRange.addEventListener("input", () => {
    confidenceValue.textContent = Number(confidenceRange.value).toFixed(2);
  });
}
