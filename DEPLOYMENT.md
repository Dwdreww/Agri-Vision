# AGRI-VISION Deployment

This project has two deployable parts:

1. Vercel hosts the static frontend and lightweight `/api/*` proxy functions.
2. A Python container host runs the real Flask + YOLO + EfficientNet backend.

Do not deploy the PyTorch/OpenCV/Ultralytics backend directly as a Vercel Python Function. Vercel Functions have bundle/runtime/payload limits, and this backend loads native ML packages plus model weights. Use Vercel as the public app URL and run the ML service on a backend host that supports containers.

Vercel references:

- Python runtime: https://vercel.com/docs/functions/runtimes/python
- Node.js functions: https://vercel.com/docs/functions/runtimes/node-js
- Function limits: https://vercel.com/docs/functions/limitations

## Files Added For Deployment

- `vercel.json` - Vercel static app and proxy function config.
- `api/predict.mjs` - Vercel proxy for image prediction requests.
- `api/health.mjs` - Vercel proxy for backend health checks.
- `.vercelignore` - keeps Vercel from uploading model weights and local-only files.
- `Dockerfile` - production backend container.
- `.dockerignore` - keeps backend image builds clean.
- `.gitignore` - local cache and generated output ignores.

## 1. Deploy The Backend First

Recommended hosts: Render, Railway, Fly.io, Google Cloud Run, AWS App Runner, or any Docker-capable VM.

Use Docker deployment if your host supports it:

```bash
docker build -t agri-vision-backend .
docker run --rm -p 7860:7860 agri-vision-backend
```

The backend service must include these files:

- `app.py`
- `requirements.txt`
- `yolov8.pt`
- `efficientnetB0.pth`

Recommended backend environment variables:

```text
PORT=7860
FLASK_DEBUG=false
FRONTEND_ORIGIN=https://your-vercel-app.vercel.app
ANNOTATION_JPEG_QUALITY=82
MAX_UPLOAD_MB=15
```

Optional model override variables:

```text
YOLO_MODEL_PATH=/app/yolov8.pt
EFFNET_MODEL_PATH=/app/efficientnetB0.pth
YOLO_CONF_THRESHOLD=0.15
```

Backend health check path:

```text
/health
```

After backend deploy, verify:

```bash
curl https://your-backend-url.example.com/health
```

Expected response:

```json
{
  "success": true,
  "message": "AGRI-VISION backend is running.",
  "device": "cpu"
}
```

## 2. Deploy The Frontend To Vercel

Import this repo into Vercel.

Use these project settings:

```text
Framework Preset: Other
Build Command: leave empty
Output Directory: leave empty
Install Command: leave empty
```

Add this Vercel environment variable:

```text
BACKEND_URL=https://your-backend-url.example.com
```

Do not include `/predict` or `/api/predict` in `BACKEND_URL`. Use only the backend origin.

Deploy, then verify:

```bash
curl https://your-vercel-app.vercel.app/api/health
```

Open the Vercel app URL and run a scan from the Scan page.

## 3. Local Development

Run the backend directly:

```powershell
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Then open:

```text
http://127.0.0.1:5000
```

To test the Vercel proxy locally:

```powershell
$env:BACKEND_URL="http://127.0.0.1:5000"
npx vercel dev
```

## 4. Single-Folder Update Workflow

Use `D:\Agri-Vision` as the only working folder. You do not need to copy files into `D:\Agri-Vision\AgriVision` anymore.

Push frontend/Vercel changes to GitHub:

```powershell
cd D:\Agri-Vision
git add .
git commit -m "Update app"
git push origin main
```

Push backend changes to Hugging Face:

```powershell
cd D:\Agri-Vision
git push hf main
```

If Hugging Face rejects the first push from this folder because the histories differ, run this once:

```powershell
git push --force-with-lease hf main
```

After that one-time alignment, normal `git push hf main` should work from the same folder.

## Troubleshooting

If Vercel returns `BACKEND_URL is not configured in Vercel`, add the `BACKEND_URL` environment variable in Vercel Project Settings and redeploy.

If Vercel returns a payload-size error, lower `MAX_UPLOAD_DIMENSION` or `IMAGE_JPEG_QUALITY` in `app.js`. Vercel Functions have strict request and response body limits, and this app returns a base64 annotated image.

If prediction times out through Vercel, upgrade Vercel function duration or call the backend directly with CORS enabled through `FRONTEND_ORIGIN`. The current proxy is configured with a 60-second max duration.

If the backend fails on startup, confirm both model files are present in the backend deployment and that the host has enough memory for PyTorch, torchvision, Ultralytics, and OpenCV.
