from __future__ import annotations

import base64
import sqlite3
import uuid
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from ultralytics import YOLO

BASE_DIR = Path(__file__).resolve().parents[1]
UPLOAD_DIR = BASE_DIR / "uploads"
DB_PATH = BASE_DIR / "potholes.db"
MODEL_PATH = BASE_DIR / "models" / "best.pt"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Pothole Detection API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with closing(get_conn()) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS reports (
                id TEXT PRIMARY KEY,
                image_path TEXT NOT NULL,
                confidence REAL NOT NULL,
                detections_count INTEGER NOT NULL,
                latitude REAL,
                longitude REAL,
                location_accuracy REAL,
                address TEXT,
                detected_at TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.commit()


def load_model() -> YOLO:
    # Fallback to default YOLOv8n if custom best.pt does not exist yet.
    model_source = str(MODEL_PATH) if MODEL_PATH.exists() else "yolov8n.pt"
    return YOLO(model_source)


model = load_model()


class PredictRequest(BaseModel):
    image_base64: str = Field(..., description="Base64 encoded jpeg/png image")
    confidence_threshold: float = Field(default=0.5, ge=0.0, le=1.0)


class SaveReportRequest(BaseModel):
    image_base64: str
    confidence: float
    detections_count: int
    latitude: float | None = None
    longitude: float | None = None
    location_accuracy: float | None = None
    address: str | None = None
    detected_at: str | None = None


def decode_image(image_base64: str) -> np.ndarray:
    payload = image_base64.split(",", 1)[1] if "," in image_base64 else image_base64
    try:
        image_bytes = base64.b64decode(payload)
        image_array = np.frombuffer(image_bytes, dtype=np.uint8)
        image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Invalid image: {exc}") from exc
    if image is None:
        raise HTTPException(status_code=400, detail="Invalid image bytes.")
    return image


def run_detection(image: np.ndarray, threshold: float) -> dict[str, Any]:
    image_h, image_w = image.shape[:2]
    image_area = float(image_w * image_h)
    results = model.predict(source=image, conf=threshold, iou=0.5, verbose=False)
    detections: list[dict[str, Any]] = []
    rejected_count = 0
    max_conf = 0.0
    for box in results[0].boxes:
        x1, y1, x2, y2 = box.xyxy[0].tolist()
        conf = float(box.conf[0].item())
        class_id = int(box.cls[0].item())
        class_name = model.names.get(class_id, str(class_id))
        width = max(1.0, x2 - x1)
        height = max(1.0, y2 - y1)
        area_ratio = (width * height) / image_area
        aspect_ratio = width / height

        # Practical filter to reduce false positives from unrelated objects.
        if area_ratio < 0.0008 or area_ratio > 0.35 or aspect_ratio > 7.0 or aspect_ratio < 0.2:
            rejected_count += 1
            continue

        detections.append(
            {
                "x1": round(x1, 2),
                "y1": round(y1, 2),
                "x2": round(x2, 2),
                "y2": round(y2, 2),
                "confidence": round(conf, 4),
                "class_id": class_id,
                "class_name": class_name,
                "area_ratio": round(area_ratio, 6),
            }
        )
        max_conf = max(max_conf, conf)
    detections = sorted(detections, key=lambda d: d["confidence"], reverse=True)[:8]
    return {
        "has_pothole": len(detections) > 0,
        "max_confidence": round(max_conf, 4),
        "detections": detections,
        "rejected_count": rejected_count,
    }


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/health")
def health() -> dict[str, str]:
    source = str(MODEL_PATH) if MODEL_PATH.exists() else "yolov8n.pt (fallback)"
    return {"status": "ok", "model_source": source}


@app.post("/predict")
def predict(payload: PredictRequest) -> dict[str, Any]:
    image = decode_image(payload.image_base64)
    return run_detection(image, payload.confidence_threshold)


@app.post("/reports")
def save_report(payload: SaveReportRequest) -> dict[str, str]:
    image = decode_image(payload.image_base64)
    report_id = str(uuid.uuid4())
    filename = f"{report_id}.jpg"
    file_path = UPLOAD_DIR / filename
    cv2.imwrite(str(file_path), image)

    detected_at = payload.detected_at or datetime.now(timezone.utc).isoformat()
    created_at = datetime.now(timezone.utc).isoformat()
    relative_path = f"/uploads/{filename}"
    with closing(get_conn()) as conn:
        conn.execute(
            """
            INSERT INTO reports (
                id, image_path, confidence, detections_count, latitude, longitude,
                location_accuracy, address, detected_at, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                report_id,
                relative_path,
                payload.confidence,
                payload.detections_count,
                payload.latitude,
                payload.longitude,
                payload.location_accuracy,
                payload.address,
                detected_at,
                created_at,
            ),
        )
        conn.commit()
    return {"report_id": report_id}


@app.get("/reports")
def list_reports(limit: int = 100) -> list[dict[str, Any]]:
    with closing(get_conn()) as conn:
        rows = conn.execute(
            "SELECT * FROM reports ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
    return [dict(row) for row in rows]


@app.get("/map-points")
def map_points(limit: int = 1000) -> list[dict[str, Any]]:
    with closing(get_conn()) as conn:
        rows = conn.execute(
            """
            SELECT id, latitude, longitude, confidence, detected_at, image_path, address
            FROM reports
            WHERE latitude IS NOT NULL AND longitude IS NOT NULL
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return [dict(row) for row in rows]

