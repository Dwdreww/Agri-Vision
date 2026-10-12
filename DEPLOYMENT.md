# AGRI-VISION deployment

## Current static frontend

The October 12 frontend restores the sign-in screen with an explicit
**Continue as guest** action. Build and deploy the existing Vite app normally
with its Firebase web configuration. Normal accounts use `VITE_WORKSPACE_MODE`;
guest entry needs no credentials and reopens saved history in this browser.
`VITE_ACCOUNT_MODE` is no longer used.

Browser mode uses IndexedDB for records and photo blobs, makes no Firebase or
workspace/scanner requests, and keeps existing Firebase records separate. The
real model and Gemini are still unavailable on the public release. Users can
save photos for later, clearly marked Not analyzed. Settings exports a JSON
backup with records and photos. See `docs/browser-workspace-2026-10-12.md`.

The current free pilot uses live Firebase Authentication and Firestore with three local processes: Vite, Flask inference, and a private workspace service. The cloud architecture below is a future deployment path requiring an explicitly authorized billing upgrade for Firebase Storage and Functions.

## Current free pilot

On this configured Mac, run `npx --yes --package=node@22 -c 'npm run pilot'`, then open `http://127.0.0.1:5173/`. The launcher starts Flask on 5001, the workspace service on 5002, and Vite on 5173. All bind to `127.0.0.1`. Vite proxies `/api/workspace/*` to the workspace service before forwarding other `/api/*` requests to Flask.

Keep `VITE_WORKSPACE_MODE=local` in `.env` and enter through normal sign-in. The launcher supplies `FIREBASE_PROJECT_ID`, `MODEL_VERSION`, the local photo directory, and application-default credentials derived from the owner's existing Firebase CLI session. The credential file is outside the checkout with permissions `0600`; its directory and photo root use `0700`. No service-account key or billing account is created. The workspace service verifies every Firebase ID token, including revocation, and derives photo ownership from the verified token.

Photos are stored at `~/.local/share/agri-vision/agri-vision-pilot/photos/{uid}/scans/{scanId}/`. Firebase stores the records and consent state. Research sharing/revocation and scan/account deletion execute the same handlers as the future cloud callables. A scan's `storageProvider` records whether its photos belong to this local service or Firebase Storage. Remove a scan through the service where its photos are stored.

The Mac and its local processes must remain available to view local photos or scan. Accounts and Firestore records require internet access. The existing Vercel frontend was released on October 10 at https://agri-vision-eosin.vercel.app/ in monitoring mode. Public inference and cloud photo storage remain pending. Do not upload the owner CLI credential to a hosting provider, expose these development services publicly, or deploy a local-mode frontend expecting a public workspace API.

Use `VITE_WORKSPACE_MODE=monitoring` for an accounts-and-records-only frontend without a photo service. For a later full Firebase cloud rollout, set `VITE_WORKSPACE_MODE=firebase` after deploying Storage and Functions, and configure production backend credentials independently.

## 1. Create the Firebase project

Use the project owner's Firebase account. Create a dedicated project, register a Web app, and enable:

- Authentication → Email/Password (new accounts can use the app immediately).
- Cloud Firestore → default database.
- Cloud Storage → default bucket. Cloud Storage requires the Blaze billing plan; set a Google Cloud Billing budget alert before rollout.
- Cloud Functions, deployed from `functions/` in `asia-southeast1`.

Add the production Vercel domain to Authentication's authorized domains. The web configuration values are used in `.env` locally and in Vercel environment variables. They are public identifiers; Firebase Security Rules, not config secrecy, protect user records. Keep Admin service credentials secret.

Use Node.js 22 for Firebase deployments and functions. The Firebase CLI is already a repository development dependency. Authenticate it to this project, install function dependencies, and deploy Authentication, rules, indexes, and functions:

```sh
npm install
npx firebase login
npm --prefix functions install
npx firebase deploy --only auth,firestore,storage,functions --project YOUR_PROJECT_ID
```

On this Mac, the default Node version is 26. A Node 22 deployment can be run without changing that default using `npx --yes --package=node@22 node node_modules/firebase-tools/lib/bin/firebase.js deploy --only auth,firestore,storage,functions --project YOUR_PROJECT_ID`. The live pilot project's ID is `agri-vision-pilot`; see `docs/rollout-status.md` for which services are already configured.

The app retrieves private image blobs from Storage. Apply `storage.cors.json` to the actual Storage bucket to allow browser GET requests, using `gsutil cors set storage.cors.json gs://YOUR_BUCKET_NAME`. See [Firebase setup](docs/firebase.md) for the callable contract, access rules, and manual researcher-role command.

## 2. Deploy the prediction backend

The Docker build needs real `yolov8.pt` and `efficientnetB0.pth` model weights. In a fresh Git checkout, fetch Git LFS objects before building:

```sh
git lfs pull
docker build -t agri-vision-backend .
```

Deploy the image to a container host with enough memory for PyTorch, torchvision, Ultralytics, and OpenCV. The Flask service is API-only; its public `/health` path is used for health checks. Configure these runtime variables:

| Variable | Purpose |
| --- | --- |
| `PORT` | Listener port; default `7860`. |
| `FIREBASE_PROJECT_ID` | Exact Firebase project ID used by the web app. |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to a runtime-mounted Admin credential file, if the host uses a file. |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Alternative secret containing the Admin service-account JSON if a runtime file is unavailable. |
| `MODEL_VERSION` | A stable label for the deployed model weights, such as `pilot-v1`. Update it whenever weights change. |
| `FRONTEND_ORIGIN` | Production Vercel origin if direct browser calls to the backend are needed. |
| `MAX_UPLOAD_MB` | Image upload limit; default `15`. |
| `YOLO_MODEL_PATH`, `EFFNET_MODEL_PATH` | Optional model-path overrides. |
| `YOLO_CONF_THRESHOLD`, `ANNOTATION_JPEG_QUALITY` | Optional prediction tuning. |

Set **one** Admin credential method using the host's secret manager. Never put service-account JSON in the repository, frontend environment variables, or the Docker build context. The backend checks Firebase ID tokens on both prediction routes and returns `401` for missing or invalid tokens. `/health` remains public. Vercel forwards the browser's `Authorization` header to the backend.

## 3. Deploy the Vercel frontend

Import this repository as a Vite project. `vercel.json` runs `npm run build`, publishes `dist`, and keeps `/api/predict` and `/api/health` as proxy functions. Configure the following Vercel environment variables and redeploy after changing them:

```text
BACKEND_URL=https://YOUR_BACKEND_ORIGIN
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
```

`BACKEND_URL` is the origin only; do not append `/predict`. The Firebase values must all come from the **same** Web app and project. Set the backend service's `FIREBASE_PROJECT_ID` to that project too.

After deployment, open the Vercel URL and register an account. Create a farm and plot, run a scan, save a photo and result, add an observation and task, and sign into a second account to confirm that the first account's records are not visible. The old browser history is offered for confirmed import and is never assigned automatically.

To approve a research user, run the trusted Admin script described in [Firebase setup](docs/firebase.md). Shared research records contain only explicitly contributed scan results; photos and farm details remain private.

## Local development and verification

Follow the free pilot instructions above for complete local operation. `npm run dev` starts the frontend alone and requires independently started backend services. `VITE_DEV_BACKEND_URL` and `VITE_DEV_WORKSPACE_URL` may override the local proxy destinations.

Run `node scripts/verify-local.mjs` using Node 22 while the pilot is running. This creates disposable synthetic accounts in the configured live project, checks real authenticated inference and private-photo/sharing/deletion flows, and removes those accounts and records afterward. For browser QA, `--keep-ui-fixture` retains one temporary account in a private local fixture file; `--cleanup-ui` removes it afterward. Never run fixture cleanup against arbitrary account IDs.

The Firebase functions emulator uses port `5002` so it can run alongside Flask. For local security-rule verification, use a demo project ID (no live account access):

```sh
npx firebase emulators:exec --project demo-agri-vision-rules-test --only firestore,storage "npm --prefix functions run test:rules"
```

The emulators require a Java runtime. On this Mac, Java 21 is installed at `/opt/homebrew/opt/openjdk@21`; set `JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home` and prepend its `bin` directory to `PATH` when using the emulators.

Before rollout, run the frontend build and Firebase function checks, then use the Emulator Suite to verify Firestore and Storage rules across two test accounts. Check that unauthorized prediction calls return `401`, research copies contain no personal fields, sharing can be revoked, and scan/account deletion removes private files. Browser flows also need a live configured Firebase project and backend. Model inference cannot run from Git LFS pointer files alone.
