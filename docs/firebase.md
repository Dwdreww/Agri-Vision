# Firebase setup for AGRI-VISION

The dedicated pilot project `agri-vision-pilot` has a registered Web app, Email/Password Authentication, and a default Firestore database with deployed rules and indexes. The free local pilot supplies private photos, research operations, and deletion through an authenticated service on this Mac. Billing remains disabled; Firebase Storage and callable deployment are deferred. See [rollout status](rollout-status.md) for verified progress.

## Free local transport

`npm run pilot` starts `functions/local-server.js` with local storage enabled. `/api/workspace/actions/{name}` accepts the same four operation names and data objects documented below, using a verified Firebase Bearer token rather than the callable wire protocol. Responses wrap the handler result in `{data: ...}`. The owner comes exclusively from the verified token; caller-supplied account IDs are never used.

`POST /api/workspace/scans/{scanId}/photos` accepts exactly two JPEG multipart parts, `prepared` and `annotated`, each at most 10 MiB, before the Firestore scan record is created. `GET /api/workspace/photos/{scanId}/{prepared.jpg|annotated.jpg}` requires the owning account and a saved local scan. Failed-save cleanup uses `DELETE` on the upload route and refuses to delete photos belonging to a saved scan. Mutations are serialized per account, uploads stop after account deletion locks it, and private images are served with `Cache-Control: no-store`.

Local records use `storageProvider: "local"`; future Firebase Storage records use `"firebase"`. Logical photo paths remain the same. The underlying local directories and credential are outside the repository and are never served as public files. The existing CLI session supplies local Admin access; use independently managed runtime credentials for any future cloud backend.

## Create and configure the project

Steps involving Storage, Functions, or billing below apply only to a future authorized cloud rollout. For the current free local pilot, enable Email/Password and Firestore and deploy `--only auth,firestore`; do not upgrade billing.

1. In Firebase Console, create a project and register a Web app. Copy its web configuration into the frontend's `VITE_FIREBASE_*` deployment variables. Firebase web configuration identifies the project; it is not an Admin credential.
2. Enable Authentication's **Email/Password** provider. Create a Firestore database in the project's default database. Enable Cloud Storage and select its default bucket. Storage and Cloud Functions require billing for this rollout; set a budget alert in Google Cloud Billing.
3. Use Node.js 22 and install dependencies with `npm --prefix functions install`, then deploy Authentication, `firestore.rules`, `firestore.indexes.json`, `storage.rules`, and Cloud Functions with `npx firebase deploy --only auth,firestore,storage,functions --project <project-id>`. Email/Password provisioning is declared in `firebase.json` under `auth.providers.emailPassword`.
4. The browser uses `getBlob()` to display private images. Apply the GET-only CORS policy to the actual default bucket with `gsutil cors set storage.cors.json gs://<bucket-name>`. This does not make photos public; Storage rules still require the owner account. Replace `*` with the production and local development origins if origin restrictions are desired.
5. Deploy the frontend after the rules and functions. All callables run in `asia-southeast1`; the browser must use `getFunctions(app, "asia-southeast1")`.

Use the Firebase Emulator Suite for local Auth, Firestore, Functions, and Storage work. The emulator ports are declared in `firebase.json`. Production Firebase config and Admin credentials must not be committed to this repository.

## Data and access contract

- Private records live at `users/{uid}` and its `farms`, `plots`, `scans`, `observations`, and `tasks` subcollections. The account owner can read and write their records. Direct scan deletion is denied; use `deleteScan` so files and research copies are removed. Farms and plots are archived via `archivedAt` rather than deleted.
- Scan photos live only at `users/{uid}/scans/{scanId}/prepared.jpg` and `annotated.jpg`. The owner can read and upload JPEGs up to 10 MiB. A client may delete an upload only before its scan record exists, for failed-save cleanup. Persisted scan photos are removed by the server. Uploads stop when account or scan deletion begins.
- `shareScanResult({scanId})` copies only `topClass`, `topConfidence`, `detectionCount`, `statusType`, `modelVersion`, UTC `month`, and optional `userCondition` into `researchResults/{randomId}`. It returns `{shared:true}`. The research copy has no account identifier, location, photo, note, farm, or plot. The private scan keeps `researchResultId`, `researchSharedAt`, and `shareForResearch` for revocation. While shared, the fields represented in the research copy cannot be edited directly; revoke first, edit, then share again.
- `revokeScanResult({scanId})` removes the research copy and returns `{shared:false}`. `deleteScan({scanId})` deletes the research copy, scan photos, and scan record. `deleteAccount({confirm:true})` requires sign-in within the past five minutes, then removes all research copies, photos, private records, and the Auth account. Deletion calls can be retried if an external operation fails.
- Only Firebase Auth tokens with the custom claim `researcher: true` can read `researchResults`. Client writes to that collection are always denied. Researchers never receive access to private account records or photos.
- The account profile may set `historyImportedAt` once after a confirmed legacy import. Imported scans may have null farm and plot references and can be linked later.

The research copy reflects a user's saved scan summary. It is not an independently verified model output, so exports should be treated as contributed pilot data.

## Grant or revoke researcher access

Run the following command from a trusted machine with Google Application Default Credentials authorized for this Firebase project. The script preserves any other custom claims:

```sh
FIREBASE_PROJECT_ID=<project-id> node functions/scripts/set-researcher.js --email researcher@example.com --grant
```

Use `--uid <uid>` instead of `--email <email>` when preferable, or `--revoke` to remove access. The researcher must refresh their Firebase ID token or sign in again after the change. Never run this script from the browser or expose Admin credentials to the frontend.

## Verification before rollout

Run `npm --prefix functions test` and `npm --prefix functions run check`. Run the rules suite with `firebase emulators:exec --only firestore,storage --project demo-agri-vision-rules-test "npm --prefix functions run test:rules"`; it checks account isolation, protected share fields, researcher reads, and Storage deletion races. Also verify callable scan/account deletion removes photos and shared results, then test registration, password reset, the complete farm/plot/scan/observation/task flow, and both screen sizes before production rollout.
