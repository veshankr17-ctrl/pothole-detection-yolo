# Live Pothole Detection System (YOLO + Map Auto-Pinning)

This project is a browser-based pothole detection system for college mini/major project demo.

## What this project does

- Opens camera from browser (mobile/laptop)
- Runs YOLO pothole detection using backend API
- Draws bounding boxes on live camera feed
- Captures location (latitude, longitude) from browser GPS
- Automatically saves pothole reports when detected
- Shows all saved potholes on map with markers
- Shows reports history with confidence, image and timestamp

## Final Architecture

- Frontend: HTML, CSS, JavaScript
- Backend: FastAPI (Python)
- Model: Ultralytics YOLOv8n
- Map: Leaflet + OpenStreetMap
- Database: SQLite
- Image storage: `backend/uploads/`

## Project Structure

```text
backend/
  app/main.py
  requirements.txt
  models/
  uploads/
frontend/
  index.html
  detect.html
  map.html
  reports.html
  assets/css/style.css
  assets/js/api.js
  assets/js/detect.js
  assets/js/map.js
  assets/js/reports.js
data.yaml
train_model.py
test_inference.py
sample_video.mp4
```

## Stage A: Dataset + Training

You already have YOLO dataset folders (`train`, `valid`, and `data.yaml`), so use them directly.

### 1) Install training dependencies

```powershell
pip install ultralytics
```

### 2) Train model

Run from project root:

```powershell
python train_model.py
```

### 3) Output

Trained best model will be at:

`runs/pothole_yolov8n/weights/best.pt`

### 4) Copy trained model for backend

```powershell
python scripts\copy_best_model.py
```

If not copied, backend will use fallback `yolov8n.pt` (general model), but pothole accuracy can be poor.

## Stop at Epoch 35 (if needed)

If you want to stop training at epoch ~35:

1. Watch training terminal until you see progress near `35/60`
2. Press `Ctrl + C` once
3. YOLO still keeps the best weights from completed epochs

Then copy model:

```powershell
python scripts\copy_best_model.py
```

## Stage B: Run Backend Locally

### 1) Create venv and install packages

```powershell
cd backend
python -m venv .venv310
.\.venv310\Scripts\activate
pip install -r requirements.txt
```

### 2) Start API server

```powershell
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 3) Test backend

Open:

- `http://127.0.0.1:8000/health`
- `http://127.0.0.1:8000/docs`

## Stage C: Run Frontend Locally

Open a new terminal:

```powershell
cd frontend
python -m http.server 5500
```

Now open:

`http://127.0.0.1:5500`

## Quick Start Scripts (Windows)

From project root:

- Start backend quickly:
  ```powershell
  .\run_backend.ps1
  ```
- Start frontend quickly:
  ```powershell
  .\run_frontend.ps1
  ```

### Setup API URL

On Home page, keep:

`http://127.0.0.1:8000`

Then open **Live Detection** page.

## Stage D: How live detection works

1. Browser asks camera + location permission.
2. Frame is captured every ~1.2 seconds.
3. Frame goes to backend `/predict`.
4. Bounding boxes are drawn on canvas overlay.
5. If pothole detected, report is auto-saved to `/reports`.
6. Map page fetches `/map-points` and shows markers.
7. Reports page fetches `/reports` and shows full history.

## API Endpoints

- `GET /health` -> backend/model status
- `POST /predict` -> image frame detection
- `POST /reports` -> save pothole report
- `GET /reports` -> all saved reports
- `GET /map-points` -> marker data for map page
- `GET /uploads/<filename>` -> saved image access

## Stage E: Free Deployment (Recommended)

Use split deployment:

- Backend on Render (free web service)
- Frontend on Netlify (free static site)

### 1) Push code to GitHub

```powershell
git init
git add .
git commit -m "Initial pothole detection web app"
git branch -M main
git remote add origin <your-github-repo-url>
git push -u origin main
```

### 2) Deploy backend on Render

1. Go to [Render](https://render.com)
2. New -> Web Service -> connect GitHub repo
3. Root directory: `backend`
4. Build command:
   `pip install -r requirements.txt`
5. Start command:
   `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
6. Deploy
7. Note backend URL (example: `https://your-backend.onrender.com`)

### 3) Deploy frontend on Netlify

1. Go to [Netlify](https://www.netlify.com)
2. Import from GitHub
3. Base directory: `frontend`
4. Build command: leave empty
5. Publish directory: `.`
6. Deploy

### 4) Connect frontend to backend

Open deployed frontend -> Home page -> set API URL to deployed backend URL.

Example:

`https://your-backend.onrender.com`

### 5) Mobile testing

Open Netlify site URL from phone browser.

Important:
- must be HTTPS (Netlify and Render are HTTPS)
- allow camera and location permissions

## Common Problems and Fixes

### Camera not opening

- Ensure website is HTTPS (or localhost)
- Give camera permission in browser settings
- Try Chrome mobile browser

### Location not captured

- Give location permission
- Turn on device GPS
- Outdoors gives better accuracy

### No markers on map

- Happens if reports saved without location
- Start detection after GPS becomes active

### Slow live detection

- Free CPU servers are slower
- This project uses interval-based live detection (practical for free tier)

## Reality note (important)

Fully smooth real-time video inference (high FPS) is usually not feasible on free hosting.
This project uses periodic frame inference to keep deployment free and stable.

## What to improve later

- Add no-pothole class balancing in training
- Add report filters (date/confidence)
- Add reverse geocoding for address
- Move image storage to Cloudinary free
- Move DB to free Postgres (Neon)

## Viva explanation (short)

“This project uses browser camera + geolocation to capture road frames and location. Frames are sent to a FastAPI backend running YOLOv8n for pothole detection. If potholes are detected, reports are stored with image, confidence, timestamp and coordinates in SQLite. The map page visualizes pothole markers using Leaflet and OpenStreetMap. The app is deployed publicly with free HTTPS hosting.”

