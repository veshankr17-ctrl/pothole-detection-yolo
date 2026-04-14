# Deploy Now (Free Public Hosting)

Follow this exact order.

## 1) Push code to GitHub

From project root:

```powershell
git init
git add .
git commit -m "Pothole detection web app with YOLO, map and reports"
git branch -M main
git remote add origin <YOUR_GITHUB_REPO_URL>
git push -u origin main
```

## 2) Deploy backend on Render (free)

1. Open <https://render.com>
2. New -> Web Service -> select your repo
3. Root Directory: `backend`
4. Build Command: `pip install -r requirements.txt`
5. Start Command: `python -m uvicorn app.main:app --host 0.0.0.0 --port $PORT`
6. Plan: Free
7. Create service

After deploy, copy backend URL:

Example:
`https://pothole-backend-xxxx.onrender.com`

## 3) Set frontend API URL for production

Open file:
`frontend/assets/js/api.js`

Set:

```js
const API_BASE_URL = "https://YOUR_RENDER_BACKEND_URL";
```

Then commit+push this change:

```powershell
git add frontend/assets/js/api.js
git commit -m "Set production backend API URL"
git push
```

## 4) Deploy frontend on Netlify (free)

1. Open <https://netlify.com>
2. Add new site -> Import from Git
3. Select your repo
4. Base directory: `frontend`
5. Build command: leave empty
6. Publish directory: `.`
7. Deploy

## 5) Final mobile verification

1. Open Netlify URL from phone (HTTPS)
2. Go to `Live Detection`
3. Allow camera + location
4. Confirm report saved
5. Open map page and confirm marker appears

## 6) If CORS issue appears

Backend already has open CORS in `backend/app/main.py`.
Redeploy backend once from Render dashboard if needed.
