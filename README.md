---
title: Agri Vision Backend
colorFrom: green
colorTo: yellow
sdk: docker
app_port: 7860
---

# AGRI-VISION

AGRI-VISION is a pineapple monitoring app for a small pilot. A signed-in user can organize farms and plots, scan a pineapple photo, compare saved results over time, add field observations, and track one-time care tasks. Approved researchers can view only scan results that an account owner explicitly contributes; photos and private farm records stay in that owner's account.

## How it is built

The frontend opens at the sign-in screen. **Continue as guest** needs no email
or password and reopens farms, plots, photo/scan history, observations, and care
tasks saved in this browser using IndexedDB. Records and photo blobs survive
reloads and returning to sign in. Settings offers a JSON backup including the
photos. Browser storage is separate for each site/browser and can be removed by clearing site data.
See [browser workspace notes](docs/browser-workspace-2026-10-12.md).

Normal sign-in uses the existing Firebase configuration and the appropriate
`VITE_WORKSPACE_MODE`; remembered account sessions remain supported. Guest mode
does not initialize Firebase or read, change, or expose account records.
`VITE_ACCOUNT_MODE` is no longer used. Real scanning and Gemini remain
pending public backend deployment; saved photos are marked **Not analyzed**.

- **Web app:** React and Vite. Firebase Authentication handles email/password accounts and Cloud Firestore stores private monitoring records.
- **Free local pilot:** Flask runs the real YOLO and EfficientNet models. An authenticated local workspace service saves photos privately on this Mac and handles research sharing and deletion. Vite forwards requests to both services. All listeners bind to `127.0.0.1`; Firebase billing remains disabled.
- **Research sharing:** The local service reuses the Firebase callable handlers to create or remove a sanitized result when its owner opts in. A manually granted researcher role can read those copies, without access to private records or photos. CSV exports also offer selectable text when a browser does not provide a downloaded file.
- **Future cloud rollout:** The repository also supports a Vercel frontend, container-hosted Flask, Firebase Storage, and deployed callable functions. Storage and Functions are deferred under the current free-only choice.

The model result is an aid to inspection. Confidence is a classifier score, not a measure of crop severity. User observations appear separately from model results.

The guided scan flow includes photo-taking tips, an optional introduction, and
text-only AI recommendations after an explicit opt-in. Advice is separate from
the model result and is saved privately on this computer. Gemini generation needs
private server configuration; scanning remains available without it. See
[AI recommendation setup and behavior](docs/ai-recommendations.md).

The frontend uses the selected guided ribbon design: React with Tailwind CSS,
clean forest-green styling, three photo-to-result steps, an expandable detailed
report, and responsive light/dark layouts. See [design notes](docs/guided-ribbon-design-2026-10-10.md).

## Static frontend setup

Run `npm install` and `npm run dev`. Configure the Firebase web values for the
sign-in screen. Guest entry needs no account or backend process. Run
`npm run build` to prepare the Vercel frontend.

## Full local pilot setup

Set `VITE_WORKSPACE_MODE=local` and sign in to use the authenticated model and
workspace services described below.

The current Mac already has the Firebase project configuration, dependencies, model weights, and owner CLI session. Start all three local services together with Node 22:

```sh
npx --yes --package=node@22 -c 'npm run pilot'
```

Open `http://127.0.0.1:5173/`. Keep the process running while using the app. Internet access is required for Firebase accounts and records. Photos stay under `~/.local/share/agri-vision/agri-vision-pilot/photos`, outside the repository; they are available only while using this Mac's local service. Include that directory in a private backup if photos must be retained.

For a fresh checkout:

1. Configure Email/Password Authentication and Firestore using [Firebase setup](docs/firebase.md). Copy `.env.example` to `.env`, fill in the actual web configuration, and keep `VITE_WORKSPACE_MODE=local`.
2. Install web and workspace dependencies and sign into the owner Firebase CLI session:

   ```sh
   npm install
   npm --prefix functions install
   npx firebase login
   ```

3. Obtain the real Git LFS model weights and prepare Python:

   ```sh
   git lfs pull
   python3 -m venv .venv
   . .venv/bin/activate
   pip install -r requirements.txt
   ```

4. Run `npm run pilot` with Node 22. The launcher uses the existing CLI session to prepare a local credential in `~/.config/agri-vision/` with owner-only permissions. No service-account key is created. An existing `GOOGLE_APPLICATION_CREDENTIALS` may be supplied instead. Never publish this credential or expose the local services to the internet.

The scanner requires a signed-in Firebase account and a selected plot. For Firebase emulator use and full deployment steps, see [Deployment](DEPLOYMENT.md). The current pilot setup and remaining cloud steps are recorded in [Rollout status](docs/rollout-status.md).

With the local pilot running, `node scripts/verify-local.mjs` under Node 22 checks actual accounts, private records, inference, photos, sharing, and deletion. It creates and cleans up disposable synthetic accounts in the configured pilot project. It does not operate on existing users.
