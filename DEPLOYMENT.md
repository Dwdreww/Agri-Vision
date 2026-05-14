# AGRI-VISION Deployment

## Frontend on GitHub Pages

GitHub Pages can host the frontend, but it cannot run the Flask Python backend. Deploy the backend on a Python host such as Render, Railway, Fly.io, or another server.

After the backend is deployed, set `apiBaseUrl` in `config.js` to the backend URL:

```text
https://your-agri-vision-backend.onrender.com
```

```js
window.AGRI_VISION_CONFIG = {
  apiBaseUrl: 'https://your-agri-vision-backend.onrender.com',
  apiKey: 'same-value-as-AGRI_VISION_API_KEY'
};
```

The app no longer shows a backend URL or API-key input on the page. It reads these values automatically from `config.js`.

The `apiKey` value in `config.js` is visible to anyone who opens the site. Use it only as a simple app access token, not as a private provider key.

## Backend Environment Variables

Set these on your backend host:

```text
PORT=5000
AGRI_VISION_API_KEY=same-value-as-config-js-apiKey
AGRI_VISION_ALLOWED_ORIGINS=https://your-username.github.io
```

If Flask serves the frontend directly, the app automatically uses the same backend origin and `apiBaseUrl` can stay empty.

If the frontend is on GitHub Pages, `apiBaseUrl` must be set in `config.js` because a static GitHub Pages site cannot discover your Flask backend URL by itself.

If you stop the Flask backend process, the frontend will show a backend connection error until you start the backend again.
