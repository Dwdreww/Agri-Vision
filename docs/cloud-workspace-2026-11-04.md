# Private cloud workspace — 4 November 2026

Production: https://agri-vision-eosin.vercel.app/

## Result

Existing Firebase Authentication accounts and UIDs are unchanged. Firestore
already held the farms, growing areas, photo records, observations and tasks.
The remaining computer-local photo and recommendation data now lives in the
deployed private workspace. Records are private to their account across devices;
there is no new administrator/adviser overview.

The cutover inventory contained 2 account profiles, 4 farms, 6 growing areas,
25 scans and 1 care task. All 50 JPEG files (3,771,896 bytes) were copied to
Vercel Private Blob and independently read back for SHA-256 comparison before
changing the scans' `storageProvider` from `local` to `vercel-blob`. All 24
recommendation caches were copied to private Firestore subdocuments. Owner and
global recommendation allowance ledgers were merged without resetting attempts.
Existing labels, model versions, timestamps and record IDs were preserved.

The original local photos and caches remain at
`~/.local/share/agri-vision/agri-vision-pilot/photos/` as a rollback copy. Private
metadata snapshots, upload hashes and the completion journal are outside the
checkout at `~/.config/agri-vision/cloud-migration-2026-11-04/` (directory 0700,
files 0600). User accounts were not recreated and passwords were not changed.

## Services and privacy

- Firebase Authentication identifies each account. Firestore remains on its
  billing-disabled project and stores private account records/preferences.
- Vercel Hobby serves React and `/api/workspace/*`. Vercel Private Blob holds
  originals and annotated compatibility images; selected crops are reconstructed
  from the original and saved bounding boxes. Blob URLs do not grant public reads.
- Every photo/API operation verifies the Firebase token including revocation.
  Ownership comes from that token, never a submitted UID or backup file.
- Google access uses Vercel OIDC, a project-restricted Workload Identity provider,
  service-account impersonation, `roles/datastore.user`, and an Auth role with
  only `firebaseauth.users.get`/`firebaseauth.users.delete`. No Google owner refresh
  token or service-account private key was installed in Vercel.
- Recommendation caches live under
  `users/{uid}/scans/{id}/private/recommendations`. Usage lives in owner-private and
  server-only documents. Client rules deny access to these subcollections.
  The API returns only the signed-in owner's advice. Existing explicit research
  contributions retain their prior behavior; private photos are never contributed.
- Gemini receives the existing allowlisted model-result fields after opt-in.
  The interface calls the feature “Recommendations” and credits Google Gemini.
  Language, theme and recommendation choice are saved in account preferences.

No billing plan or hardware upgrade was made. Vercel was verified as Hobby,
Firebase billing as disabled, and Hugging Face as `cpu-basic`. Free service
quotas still apply; the model Space can sleep. See
[Vercel Blob limits](https://vercel.com/docs/vercel-blob/usage-and-pricing) and
[Space lifecycle](https://huggingface.co/docs/hub/spaces-overview#lifecycle-management).

## Guest import

Guest data has no account owner and is never silently assigned to someone.
In guest Settings choose **Export records & photos**, then sign in and open
**Settings → Import guest backup**. Select that JSON file, review the account
and counts, and select **Import into my account**.

The importer preserves farm/area relationships, dates, field notes, tasks and
photos. Guest photos stay **Not analyzed**. It discards source ownership and
sharing state, uploads only fixed owner-scoped JPEG paths and never fetches
URLs from a backup. Stable import identifiers allow an interrupted import to
resume; repeated records are skipped rather than overwritten. Original browser
records and the backup file are retained.

## Model and layout update

The user-supplied replacement EfficientNet has SHA-256
`5b0e1f7211aaa8e8191218ecc62b682a15618b2e0a2109e8bddcfcd37d7fbd85`.
It passes restricted `weights_only=True` loading, finite tensor checks, strict
EfficientNet-B0 state loading and a four-output CPU forward pass. The user
confirmed the existing class order: No Disease, Fruit Fasciation, Fruit Rot,
Multiple Crown. Prior training accuracy metrics do not evaluate this checkpoint.

The live model version is
`yolov8m-28a5c00ab63b-effnetb0-5b0e1f7211aa-roi-v2`.
YOLO remains `bestv3.pt` at default confidence 0.65. Only unannotated detected
bounding-box crops reach EfficientNet; no detection means no classifier call.
Original and cropped image versions remain available. Historical predictions
retain their original versions and are not recomputed.

Growing-area management actions now wrap with explicit gaps and 44px targets.
Settings uses shrinkable columns, wrapping text and a full-width language
selector. The requested Your account and Research access cards were removed;
sign-out remains in the account menu. Verified at 390px and desktop widths.

## Verification and recovery

- 74 JavaScript tests, 71 service tests and 26 Python tests passed; Vite build passed.
- Live cloud API checks covered authentication, immutable private photo upload,
  byte verification, foreign-account denial (photos and Firestore), private
  recommendation persistence and real Gemini generation.
- Actual authenticated inference passed through the production Vercel proxy
  with the new model, returning original and cropped image versions.
- All 25 real history thumbnails loaded after stopping the local Flask/workspace
  processes. A guest fixture imported 5 records; repeating it skipped all 5.
- Account theme persistence and mobile widths were checked in a disposable
  account. Real accounts were not used for destructive verification.
- The deployed owner's scan/account deletion endpoints removed the disposable
  scan, its private recommendation cache, both QA accounts and their records.
  The final inventory again contains only the original two Auth accounts and
  two profiles. Anonymous access to a direct private Blob URL returned 403.
- The Firebase emulator suite was not run because Java is absent; deployed
  Firestore account isolation was tested with real disposable accounts instead.

Current logs and screenshots are in ignored `output/cloud-migration-2026-11-04/`
and `output/ui/cloud-workspace-2026-11-04/`. Twenty obsolete design/scratch/style
and superseded release items were moved out of the project to
`~/.local/share/agri-vision/archived-project-files-2026-11-04/`, with a manifest.
They can be recovered without restoring old styles into the active application.

For a storage rollback, retain all cloud copies, verify the local files against
the saved journal, then restore only affected scan provider pointers and use the
matching local workspace configuration. Do not replace whole current records
with the initial snapshot: that would discard subsequent account edits.

The migration script is reviewed in dry-run mode by default. `--apply` copies
and verifies before changing pointers, detects concurrent record edits and can
resume safely. Ledger source markers prevent double-counting local attempts.
