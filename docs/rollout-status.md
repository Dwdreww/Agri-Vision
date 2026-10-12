# Pilot rollout status

## Static browser frontend — 2026-10-12

The frontend opens at sign-in with **Continue as guest** for entry without
credentials. Guest farms, plots, photo/scan records, observations, and tasks
persist in IndexedDB on the current browser, including after returning to sign
in and reentering. Settings provides a records-and-photos backup export. Normal
accounts and their private Firebase records remain separate and use the existing
Firebase configuration. `VITE_ACCOUNT_MODE` is no longer used. Real model
scanning and Gemini still await the public backend deployment. Saved photos are explicitly Not analyzed.

The deployment path remains GitHub `main` to the existing Vercel project. See
`browser-workspace-2026-10-12.md` for persistence behavior and verification.

The free local pilot is connected to live Firebase Authentication and Firestore. Real inference, private photos on this Mac, research sharing, and deletion run through local services. Firebase billing remains disabled. The existing Vercel frontend was deployed on October 10 in monitoring mode; public scanning and cloud photo storage remain pending.

## Public frontend release on 2026-10-10

- Pushed commit `c6070434c19c539ef5382ec540d80ac9412a7b2c` to GitHub `main` for the deadline release.
- The existing Vercel project deployed successfully at https://agri-vision-eosin.vercel.app/ with the public Firebase web configuration and `VITE_WORKSPACE_MODE=monitoring`.
- Production login and assets were verified. The production backend health check returned 503; scanning, photo storage, and Gemini are not ready for public use.
- The guided ribbon frontend update includes the three-step scanner, expandable reports, reorganized overview, and compact scan record correction. It is published through GitHub `main` and the existing Vercel project, keeping production in monitoring mode. It does not change the public model or activate Gemini.

## Completed locally

- Login, registration, password reset, farm and plot dashboard, scan timeline, observations, care tasks, activity history, research view, and light/dark layouts.
- Private account records and photo paths, scan saving with an unsaved retry state, one-time confirmed browser-history import, and research opt-in and revocation.
- Firebase owner-only Firestore and Storage rules, researcher-only contributed-result reads, and callable functions for research sharing, scan deletion, and account deletion.
- Firebase ID token verification on the Flask prediction endpoint and a public health endpoint.
- Production frontend build, research sanitizer checks, function syntax checks, Python syntax checks, and desktop/phone sign-in layout review.
- The real YOLO and EfficientNet Git LFS objects are present locally. A Python virtual environment is installed, both models load on this Mac, `/health` responds on port 5001, and an unauthenticated prediction request returns `401`. The direct prediction pipeline returned a result and annotated JPEG for `pineappletest.png`.
- Firebase CLI and Java 21 are installed locally. All four existing Firestore/Storage emulator security checks passed: account isolation, managed research fields, researcher access, and private photo handling. The functions emulator now uses port 5002 to avoid Flask's port 5001.

## Live setup completed on 2026-10-07 (Asia/Manila)

- The owner completed Firebase CLI sign-in independently. Authenticated project listing works through that CLI connection. Browser access to Firebase Console has not been reverified and must not be assumed restored.
- Recovered the existing active Google Cloud project `agri-vision-pilot` (**AGRI-VISION Pilot**) in the previously selected organization. Earlier console creation had left a cloud project without Firebase resources; `projects:addfirebase` completed that connection without creating a duplicate project.
- Registered **AGRI-VISION Web** and saved its actual web configuration in ignored local `.env`. No Admin credential was created or added.
- Deployed Email/Password Authentication from the new `firebase.json` Auth configuration.
- Created the standard `(default)` Firestore database in `asia-southeast1`, then deployed the repository's owner-only rules and indexes successfully.
- Eleven live Auth/Firestore checks passed: two accounts registered without email verification; an owner created a profile and farm and read that farm; another account and signed-out requests were denied access; direct client research sharing, research-copy creation, and ordinary-account research reads were denied. Temporary accounts and documents were removed after verification.
- The frontend production build with the actual Firebase configuration passed. All three research sanitizer tests and function syntax checks passed under Node 22, available locally through `npx --yes --package=node@22`.
- The project billing check returned `false`. The SDK reports the intended bucket name, but this does not establish that a bucket has been provisioned.

## Free local setup completed on 2026-10-08 (Asia/Manila)

- The owner requested completion without interruptions and confirmed the free-only choice. The pilot uses this Mac for inference and private photos; no replacement hosting provider, paid service, or billing upgrade was introduced.
- `npm run pilot` starts Vite, the real Flask models, and a local workspace service. Each service listens only on `127.0.0.1`. Both health endpoints report ready.
- The owner's existing Firebase CLI session supplies local application-default credentials outside the repository. The credential directory is private (`0700`) and the credential file is owner-readable only (`0600`). No new service-account key was created. Node and Python Admin connections were verified.
- Photos are stored outside the checkout under `~/.local/share/agri-vision/agri-vision-pilot/photos`, with private directories and files. Firebase stores owner-only records, consent, and sanitized research contributions. Scans record `storageProvider` so deletion uses the matching photo service.
- The authenticated local service reuses the four existing callable handlers: research share/revoke, scan removal, and account removal. All service requests verify Firebase ID tokens and revocation. Upload and deletion mutations are serialized per account.
- The UI checks service availability, offers recovery, and automatically rechecks it. Features are enabled only when their configured service is available. Local photo storage is explained in the scan screen.
- Nine live end-to-end checks passed: immediate registration; private farm/plot/observation/task records; invalid and signed-out requests rejected; real authenticated YOLO/EfficientNet inference; private saved photos and saved-photo cleanup protection; sanitized researcher-only contributions; revocation; complete scan removal; and complete account removal including old-session rejection.
- Nine focused checks passed, covering upload validation, private photo paths/replacement/deletion, research sanitization, CSV privacy/formula escaping, and bounded authentication transport retries. The production frontend build and Node/Python syntax checks passed.

## Browser verification on 2026-10-08

- A disposable account signed in and loaded the actual Firestore farm, plot, observation, and due/overdue task records.
- A real photo passed browser resizing and authenticated inference. With saving deliberately blocked for only the test account, the completed result remained visible with an unsaved notice. Unlocking that account and choosing **Retry saving** persisted the same result and its photos, without a second inference request, and performed the selected research opt-in.
- The plot timeline displayed the saved result. Both private prepared and annotated photos loaded. Model output and the latest user observation appeared separately.
- Observation creation, task creation, and task completion passed through the browser. Research opt-in, revocation, role refresh, and the approved researcher table also passed.
- Desktop (`1280×900`) and phone (`375×812`) overview layouts fit the viewport without horizontal page overflow. The phone bottom navigation and menu research link worked. The temporary viewport override was reset.
- The CSV preview contains exactly the approved header and one contributed row, with no account, photo, farm, or note fields. The in-app browser's download event did not provide an artifact, so the exporter also presents selectable CSV text. That fallback was verified in the rendered UI; native file download is not independently confirmed in this browser.
- Initial browser sign-in and token-refresh requests encountered transient Firebase transport failures, then succeeded on retry. Login and researcher refresh now retry only that transport error, at most three attempts. Invalid credentials return immediately; registration and reset-email operations are not blindly repeated.
- The requested real account was created in Firebase Authentication and its login verified. The password was not written to Firestore, source files, or documentation. Disposable test accounts, records, contributions, and photos are removed after QA.

## Operation and remaining cloud work

Use `npx --yes --package=node@22 -c 'npm run pilot'` on this Mac and open `http://127.0.0.1:5173/`. Keep the process running. Internet access is required for Firebase accounts and records. Photos are tied to this Mac and should be included in a private backup if they must be retained.

The local service is a development pilot, not a public multi-device deployment. Firebase Storage and Cloud Functions are not deployed. A future public rollout needs a selected hosting destination, independently managed backend credentials, authorized frontend domains, and a private photo service. The original Firebase cloud path also needs a future owner-authorized billing upgrade and budget alert. None of those choices should be assumed from the local pilot's passing tests.

Firebase Console browser access was previously denied and remains unverified. Work used the CLI session the owner independently authenticated; local app testing is separate from Firebase Console access.

## UI revision completed on 2026-10-08

The human resumed implementation with “proceed.” Pineapple Health branding, a
cleaner monitoring layout, a combined dated Activity timeline, and condition-type
badges plus a guide to all seven supported labels are implemented locally.
Activity includes search and filters across scans, observations, and care tasks;
tasks are positioned by due date. Six new focused checks and the existing nine
checks passed, as did the production build and function syntax checks. Desktop
and actual app phone-width light/dark layouts were verified; private photos and
existing scan details still load. QA used read-only existing records and temporary
local sample data. See [UI revision evidence](ui-revision.md) and
[classification references](conditions.md). Public cloud rollout remains pending.

### Full revision-plan audit

The original plan was recovered from “Thesis Handoff 2” after the initial handoff-
based implementation. Its remaining UI requirements are now implemented, including
Today-first ordering, date shortcuts, category-specific statuses, completion dates,
50-record pagination, midnight refresh, and five consistent main destinations.
The build and 22 focused checks passed; frontend date checks also passed in two
timezones. See the [full-plan checklist](ui-revision-checklist.md). The initial
six frontend checks noted above have been expanded to thirteen.

## Guided scanning and AI recommendations on 2026-10-08

The approved follow-up plan is implemented locally. Scanning now guides plot
selection, photo preparation and preview, inference, automatic saving, and result
review. Photography tips, confidence explanations, seven condition classes,
pathological/physiological badges, an optional introduction, and replayable help
are included. Activity and the five main destinations remain intact.

Optional Gemini 3.5 Flash-Lite recommendations use authenticated owner-scoped
routes in the local workspace service, strict saved-result input, structured plain
text, atomic private sidecar storage, caching, concurrency controls, cooldowns,
daily limits, and a provider timeout. The account/device opt-in explains Google's
free-tier data use; Settings provides an off switch. Photos and identifying
details are excluded from provider requests. No Firestore migration or billing
change was introduced.

The production build, 55 automated checks, and 11 live disposable-account checks
pass. Browser checks include actual inference, save retry, history, opt-in/off,
desktop/tablet/phone themes, keyboard dialogs, and mobile navigation. See
[AI recommendation verification and configuration](ai-recommendations.md) for
details and browser limitations.

No provider key is configured. Normal scanning and standard guidance work;
real Gemini generation and its final text-only smoke test remain pending private
configuration. The local pilot remains running at `http://127.0.0.1:5173/`.
