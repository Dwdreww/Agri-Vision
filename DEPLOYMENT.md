# AgriVision deployment

## Current release

- Frontend and private workspace: https://agri-vision-eosin.vercel.app/
- API-only model service: https://drewtopiaa-agrivision.hf.space/
- Firebase project: `agri-vision-pilot`, Authentication and Firestore, billing disabled.
- Photo storage: Vercel **Private** Blob `agri-vision-photos`, Singapore, Hobby.
- Workspace mode: `cloud` in production and preview.
- Active model: `yolov8m-f53a9470b13c-effnetb0-03af1ac8bba3-roi-v3`.

The November 3 unsaved model demo has been replaced with the private cloud
workspace. Existing account records, photos and recommendations are accessible
without this Mac. See the [migration, privacy and recovery report](docs/cloud-workspace-2026-11-04.md).

## Vercel configuration

Use the existing linked project, Vite preset, Node 22, `npm ci`, `npm run build`
and `dist`. Set public Firebase web configuration and `VITE_WORKSPACE_MODE=cloud`
for both preview and production. `BACKEND_URL` points to the model service.

Server-only settings are `FIREBASE_PROJECT_ID`, `GCP_PROJECT_NUMBER`,
`GCP_SERVICE_ACCOUNT_EMAIL`, `GCP_WORKLOAD_IDENTITY_POOL_ID`,
`GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID`, `BLOB_STORE_ID` and `GEMINI_API_KEY`.
Optional recommendation limits lower the defaults of 10 attempts per account,
50 overall per UTC day and a 30-second per-account cooldown. Never prefix a
server secret with `VITE_`.

The workspace service is `api/workspace.mjs`; an explicit rewrite routes
`/api/workspace/*` to it, including multi-segment photo paths. `api/predict.mjs`
and `api/health.mjs` proxy the model API. Authenticated requests derive ownership
from verified Firebase tokens; storage URLs are private.

Google authentication uses Vercel OIDC with exact project/environment trust and
service-account impersonation. No local owner credential or Google private key
belongs in the deployment. Keep `google-auth-library` on the Firestore-compatible
9.x major unless upgrading and validating the entire Google client stack: the
older Firestore transport expects plain header records rather than 10.x Headers.

Provisioning helpers run locally in review mode by default:

```sh
node scripts/provision-cloud.mjs
node scripts/configure-cloud-env.mjs
node scripts/migrate-local-cloud.mjs
```

`--apply` applies the reviewed configuration/migration. The helpers verify Hobby
and billing-disabled Firebase before mutation. Private snapshots and migration
credentials stay outside the checkout. Do not rerun a production migration as
a substitute for examining its plan and existing completion journal.

Deploy a preview with `npx vercel deploy`, check its authenticated workspace,
then deploy production with `npx vercel deploy --prod`. Deployment protection on
preview URLs is expected; use the owner's CLI for authenticated verification.
`.vercelignore` excludes models, owner scripts, local data, environment files,
QA output and design archives from deployed files.

## Model service

The existing `Drewtopiaa/AgriVision` Space remains on `cpu-basic`. Set the public
Firebase project/API key and `FIREBASE_AUTH_MODE=rest`; never upload the owner's
Admin credential. The user-supplied files and exact hashes are in the
[model inventory](models/README.md). YOLO defaults to 0.65. EfficientNet requires at least 0.35 confidence; the Space sets
`EFFNET_CONF_THRESHOLD=0.35`.

```sh
node scripts/prepare-release.mjs
# Using the configured, isolated Hugging Face deployment-tools Python:
python scripts/deploy-space.py
```

The deployment script verifies the allowlisted release hashes, existing owner,
repository and free CPU hardware. Current backend commit:
`575d5ebdf374c73f0c193e6ec648e4428851b21c`. The API processes images in memory;
photo persistence belongs to the private workspace service.

## Local development and recovery

`npm run dev` starts Vite. In cloud mode point `VITE_DEV_WORKSPACE_URL` and
`VITE_DEV_BACKEND_URL` at the deployed frontend. No owner credential or local
Python process is needed for that development setup.

The original `npm run pilot` path is retained for explicit local-mode recovery
and model development. It starts Flask, the private local workspace and Vite.
Use `VITE_WORKSPACE_MODE=local` and local proxy targets only with matching local
records/storage. Already migrated cloud records should stay on cloud mode;
follow the recovery report before restoring any provider pointers.

Guest mode stays browser-local until the user explicitly imports a backup into
a signed-in account. Firebase Storage/Functions and a billing upgrade are not
required by this deployment.
