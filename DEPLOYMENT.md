# AGRI-VISION Deployment

## Frontend on GitHub Pages

Open the deployed site, go to `Scan`, then open `Backend Settings`.

Set `Backend URL` to your deployed Flask backend, for example:

```text
https://your-agri-vision-backend.onrender.com
```

If your backend uses an API key, enter it in the `API Key` field. This stores the key only in that browser's local storage.

You can also set a default backend URL in `config.js`:

```js
window.AGRI_VISION_CONFIG = {
  apiBaseUrl: 'https://your-agri-vision-backend.onrender.com',
  apiKey: ''
};
```

Do not commit private provider keys or long-lived secrets to `config.js`. Anything in frontend code is visible to site visitors.

## Backend Environment Variables

Set these on your backend host:

```text
PORT=5000
AGRI_VISION_API_KEY=optional-shared-key
AGRI_VISION_ALLOWED_ORIGINS=https://your-username.github.io
```

If `AGRI_VISION_API_KEY` is set, `/predict` requires the same value in the frontend `API Key` field.

For easier testing you can omit `AGRI_VISION_API_KEY`. By default, CORS allows frontend requests from any origin.
