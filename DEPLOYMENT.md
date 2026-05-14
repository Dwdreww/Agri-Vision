# AGRI-VISION Deployment

## Frontend on GitHub Pages

Open the deployed site, go to `Scan`, then open `Backend Settings`.

Set `Backend URL` to your deployed Flask backend, for example:

```text
https://your-agri-vision-backend.onrender.com
```

You can also set a default backend URL in `config.js`:

```js
window.AGRI_VISION_CONFIG = {
  apiBaseUrl: 'https://your-agri-vision-backend.onrender.com'
};
```

## Backend Environment Variables

Set these on your backend host:

```text
PORT=5000
AGRI_VISION_ALLOWED_ORIGINS=https://your-username.github.io
```

If Flask serves the frontend directly, the app automatically uses the same backend origin and you do not need to enter a backend URL.

If the frontend is on GitHub Pages, it cannot automatically know where your Flask backend is deployed. Set the backend URL in `config.js` or enter it once in `Backend Settings`.

If you stop the Flask backend process, the frontend will show a backend connection error until you start the backend again.
