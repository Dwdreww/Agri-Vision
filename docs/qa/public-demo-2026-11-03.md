# Limited public demo verification — 2026-11-03

The owner selected a free-only public demo, then requested that Hugging Face
serve only the model API. The frontend is https://agri-vision-eosin.vercel.app/
and the backend is https://drewtopiaa-agrivision.hf.space.

Vercel production deployment: `dpl_7CBdyjM89TE9E63gWo5fDdTEHN72`.
Hugging Face backend commit: `06efdc2b48f0d8749dcd5dfdec1248214f24793f`.
The runtime reports RUNNING on cpu-basic with that same commit.

## Model and session checks

The health response confirms best.pt SHA-256
`273092bf7850ed863cfe31d32c380326e852b162bfc3f347dee2c760f641018c`,
EfficientNet-B0 classification readiness, the four confirmed classes and model
version `yolov8m-273092bf7850-effnetb0-43adddf64b22-roi-v1`.

`scripts/verify-demo.mjs` passed against both public origins using disposable
Firebase accounts. Each origin passed health, signed-out rejection, malformed
token rejection, tampered signature rejection, actual paired inference,
disabled-account rejection, revoked-session rejection and deleted-account
rejection. The scanner validates Firebase sessions through Google's
accounts:lookup endpoint with project/time/UID and validSince checks; no local
Admin credential is deployed. The verification accounts were removed.

The backend root returns application/json with API endpoint information.
Requests to index.html, app.js and style.css return 404. The remote repository
no longer contains the legacy frontend/proxy files or the two old root models.

## Browser checks

A disposable account with no growing areas signed into the production frontend,
uploaded the existing pineappletest.png fixture, reviewed it and ran a scan.
The result showed one YOLO region, Fruit Rot Disease from EfficientNet, YOLO
confidence 70.5% and classifier confidence 52.4%. The browser prepares the photo
before inference, so scores can differ from submitting the original fixture
bytes directly. This verifies the deployed integration, not model accuracy.

The numbered overlay and selectable region worked. The result was checked at
desktop and 390px mobile widths. Start another check cleared the temporary
result. No scan was added to Firestore, and no cloud photo upload, research
sharing or AI generation was invoked by the demo scan.

There are 23 passing Python tests, 60 passing frontend tests and a successful
Vercel production build. Evidence is saved locally under
`output/release-2026-11-03/`: deployment/runtime manifests, build/test logs,
public-verification.json, api-only-verification.json and result screenshots.
Disposable browser-account cleanup is performed with
`node scripts/verify-demo.mjs --cleanup-ui` after the browser checks.

## Availability and scope

The existing Space remains on free CPU hardware. It can sleep after inactivity;
the frontend checks health on opening and retries while the backend starts.
The full local pilot still provides private saved photos, scan deletion,
research sharing and optional AI recommendations. Those services are outside
this limited public model demo; Firebase Storage and Functions remain deferred.
