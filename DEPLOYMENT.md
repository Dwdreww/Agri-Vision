# AGRI-VISION Deployment

## Why GitHub Pages Needs A Backend URL

GitHub Pages only hosts static frontend files. It cannot run `app.py`, load the model files, or handle `/predict`.

Local Flask works because `http://127.0.0.1:5000` serves both the frontend and backend. On GitHub Pages, the frontend must call a separate public Flask backend URL.

## Backend

Deploy this repository as a Python web service on a host such as Render, Railway, or Fly.io.

This repo includes:

```text
Procfile
render.yaml
requirements.txt
```

The backend start command is:

```text
gunicorn app:app --bind 0.0.0.0:$PORT --timeout 180
```

Set these backend environment variables:

```text
AGRI_VISION_API_KEY=choose-a-simple-app-token
AGRI_VISION_ALLOWED_ORIGINS=https://dwdreww.github.io
```

After deploy, test:

```text
https://your-backend-url/health
```

## Frontend On GitHub Pages

The GitHub Pages workflow now generates `config.js` during deployment.

Set these in GitHub:

```text
Settings -> Secrets and variables -> Actions -> Variables
AGRI_VISION_API_BASE_URL=https://your-backend-url
```

```text
Settings -> Secrets and variables -> Actions -> Secrets
AGRI_VISION_API_KEY=same-value-as-backend
```

Then push to `main` and wait for the Pages workflow to finish.

The deployed page will not show backend settings. It reads the backend URL and API key automatically from the generated `config.js`.

## Important

The API key in frontend JavaScript is visible in the browser. Use it only as a simple app access token, not as a private provider secret.

If the GitHub Pages UI looks older than local, hard refresh with `Ctrl + F5` after the workflow finishes.
