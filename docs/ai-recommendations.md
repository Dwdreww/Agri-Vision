# Scanning and recommendations

## Current cloud release — November 4, 2026

Production Gemini generation and private Firestore caches are active through the
Vercel workspace API. Preferences sync with the account, photos remain private
in Vercel Blob, and existing local caches/usage counts were migrated without
resetting allowance. The interface uses **Recommendations**, with Google Gemini
attribution. The model pair includes the November 4 replacement EfficientNet.
See [cloud setup, verification and recovery](cloud-workspace-2026-11-04.md).
The configuration below describes both the server settings and retained local
recovery service; production secrets belong in Vercel, never frontend files.

Current scans use the replacement four-class EfficientNet-B0; the condition
guide retains historical classes. AI advice is separate from the model
prediction and its suggested next step.

## EffNet recommendations and result removal — November 3, 2026

The result screen includes **Delete check** beside **Start another check**.
Confirmation explains that removal includes the record, photos, saved advice
and any research contribution. Failed deletion keeps the result visible with
an error; successful deletion resets the scanner. Active advice requests are
cancelled while removal runs, and server account locks prevent deleted advice
from being recreated.

Prompt `pineapple-care-v4-effnet` explicitly assigns classification to EffNet
and region selection to YOLO. Current results are interpreted using their saved
EffNet output index, original training label and classifier confidence. The
request excludes detector labels and YOLO scores. It provides basic actions
tailored to No Disease, Fruit Rot, Fruit Fasciation or Multiple Crown, using the
existing reviewed guidance. See [the exact prompt](recommendation-prompt.md).

Reading a saved result now returns reviewed standard actions immediately when
there is no valid cached advice. This makes no provider request, writes no
sidecar, and consumes no AI quota. Optional AI opt-in remains required for Gemini
generation; existing private configuration, cooldowns and daily limits apply.
With opt-in enabled, a newly saved check can replace the displayed standard
guidance with AI advice. History opens with cached advice or standard actions
without generating new AI advice automatically.

## Using the feature

Choose a plot, add or capture a clear photo, review the preview, then select
**Check pineapple**. The normal model result saves automatically. Preparing,
analyzing, and saving are separate stages; an AI request never determines whether
a scan can be saved.

The first AI opt-in explains what Google receives and how its free service uses
inputs and outputs. The choice applies to the signed-in account across devices in cloud mode
and can be disabled in Settings. Once enabled, new successfully saved scans can
generate recommendations automatically. Opening scan history retrieves existing
advice without automatically generating more. Advice can be copied or explicitly
regenerated.

The current opt-in covers the saved original scan photo and validated model
result. Earlier text-only consent does not authorize sending photos. Gemini
reviews the photo alongside EfficientNet's classification and selects field
checks from the 10-section agronomist prompt. The result shows visible
features Gemini selected from the photo. If a completed scan has no detection or
an uncertain crop, the report describes visible features and general field
checks without assigning a condition. Missing photos leave
standard guidance or existing saved advice available. Farm and plot names,
account identifiers, saved locations, and field notes stay in the workspace.
Research sharing remains a separate choice.

## Private configuration

The local Node workspace service uses Gemini 3.5 Flash-Lite. Its API key belongs
in private configuration outside the repository, at
`~/.config/agri-vision/ai.env`, with owner-only file permissions (`0600`):

```dotenv
GEMINI_API_KEY=your-key
# Optional lower application limits:
AGRI_VISION_AI_OWNER_DAILY_LIMIT=10
AGRI_VISION_AI_GLOBAL_DAILY_LIMIT=50
AGRI_VISION_AI_COOLDOWN_SECONDS=30
```

Restart the local pilot after configuring the key. Never use a `VITE_` variable
for this secret. The launcher passes AI configuration only to the workspace
service, not to the frontend or inference process. No key is included in this
revision, and normal scanning remains available without one.

The daily settings may reduce the default limits, up to the maximum of 10 per
account and 50 overall. Allowances reset at UTC midnight. Cooldown is configurable
from one second to one day. Usage attempts are saved outside the repository so
restarting the pilot does not reset the daily counts.

The application does not enable billing or switch to a paid provider. Free-tier
eligibility and quota are properties of the configured Google project and should
be checked there before activation.

## Storage and behavior

In cloud mode, recommendations are saved in private Firestore subdocuments and
served through the authenticated account API. They follow the account across
devices. Owner/global usage ledgers are transactional and private. Scan/account
removal also removes saved advice. The local-mode recovery path retains sidecar
files outside the repository.

The cache depends on the normalized result and model/prompt/schema versions.
Regeneration replaces the cache only after a valid response. Provider failures
retain existing advice and expose clearly labeled standard guidance when needed.
Unknown labels and No Detection are inconclusive, never healthy classifications.
The generative service cannot add disease classes, confidence scores, ripeness,
freshness, or food-safety assessments to the scanning model.

The local service bounds provider calls with a 60-second timeout, one active
generation globally, a 30-second account cooldown, and daily application limits
of 10 attempts per account and 50 overall. Cache reads do not consume these limits.
Provider quota failures remain recoverable and never trigger a paid fallback.

## Local API

Both routes require a valid, non-revoked Firebase Bearer token and read only the
signed-in owner's scan:

- `GET /api/workspace/scans/:scanId/recommendations` reads cached advice; it never
  calls Gemini.
- `POST` to the same route accepts only
  `{ "regenerate": false, "consentVersion": "2026-11-10-photo" }`. Set `regenerate`
  to `true` only for the user's explicit regenerate action. The server reads the
  saved model result and the original photo. The cloud API also verifies the
  owner's saved photo-sharing preference before sending either input to Gemini.

Responses include `{ available, recommendation }`. Advice contains `source`
(`gemini` or `standard`), `analysis`, `concerns`, `actions` (`text` and `reason`),
`tips`, and provider/model/time metadata. A provider failure can return prior
advice or standard guidance alongside a friendly error. Rate-limit responses use
HTTP 429 and `Retry-After`. The public health endpoint exposes only a boolean
recommendation capability, never configuration or key values.

## Provider references

- [Gemini 3.5 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite)
- [Gemini pricing and free-tier information](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini terms and unpaid-service data use](https://ai.google.dev/gemini-api/terms)
- [Structured output](https://ai.google.dev/gemini-api/docs/structured-output)

Condition guidance uses the references recorded in [conditions.md](conditions.md).
Reports, feedback ratings, automated image-quality scoring, and translation are
outside this revision. Photo-taking instructions and English guidance are included.

## Verification on 2026-10-08

- All 55 automated checks pass: 24 frontend checks and 31 workspace checks. The
  original 22 checks remain covered. The production frontend build and workspace
  syntax checks pass.
- Eleven live checks passed with disposable Firebase accounts and actual local
  inference. These include owner isolation, private photos, recommendation consent
  and no-key behavior, unchanged scan documents, cached inconclusive guidance,
  research sharing/revocation, and scan/account deletion including advice files.
- Browser verification covered photo preparation, actual inference, deliberately
  failed saving, successful retry of the same result, recommendation opt-in/off,
  history retrieval, imported summaries with unavailable confidence, labeled
  inconclusive standard guidance and Copy, navigation announcements, introduction replay, dialog/menu
  keyboard trapping, Escape dismissal, and focus restoration. Chrome's extension
  file-upload permission was unavailable; a temporary, explicitly labeled local
  QA page selected the bundled sample through the normal photo-preparation handler.
  It is removed after verification. The native file chooser is not independently
  confirmed in this browser session.
- Desktop, tablet, and phone layouts were reviewed in light and dark themes at
  actual CSS widths of 1280, 768, and 375 pixels. Narrow screens stack the scan
  cards; controls and advice wrap within their cards. Reduced-motion styles and
  live-region structure were reviewed. Audible screen-reader output was not
  independently tested.

At the time of this verification, no Gemini key was configured and generation
was unavailable. Provider behavior, malformed responses, timeouts, limits,
deduplication, failed regeneration, cancellation, and deletion races were tested
with mocked responses. A live provider test was still pending; see the later
verification below.


## Live configuration verification on 2026-10-22

- The private key is now configured in `~/.config/agri-vision/ai.env`, outside
  the repository, with file permissions `0600`. It is passed only to the local
  workspace service. No credential is recorded in source or documentation.
- A real text-only call to `gemini-3.5-flash-lite` returned HTTP 200 and passed
  the application's recommendation validator, producing three suggested actions.
  This test used a synthetic model result, without private records or photos.
- The loader now accepts Google's authorization-key format as well as legacy
  keys. The validator accepts narrowly negated diagnostic wording while still
  rejecting affirmative diagnosis claims and unsupported treatment instructions.
  The prompt version is `pineapple-care-v2`.
- All 33 backend tests and the backend syntax checks pass, including regression
  coverage for both fixes.
- After restarting the full pilot, both health routes through the Vite proxy
  report ready: scanner ready and recommendations available. Both trained model
  weight files load successfully. An unauthenticated recommendation request
  returns HTTP 401.
- The rendered account workspace and Settings load without browser console
  errors. The recommendation preference is available and remains off until the
  user opts in. No account preference or existing scan was changed by this test.
- The local app is available at `http://127.0.0.1:5173/?guest=0`. Application
  limits remain 10 attempts per account per day, 50 overall, and a 30-second
  cooldown. This verification did not enable billing or deploy a public backend.

The initial setup verification did not exercise signed-in generation from a
saved scan; the later slow-response fix below includes that check. To use it, enable **Optional AI recommendations** in
Settings, then save a new scan or open a saved result and choose **Generate
recommendations**. Guest mode does not offer Gemini generation.


### Slow-response fix on 2026-10-22

A later live request exceeded the old 20-second deadline. Repeating the same
synthetic request with a longer bound returned valid Gemini advice in 24 seconds.
The provider and service now share a 60-second deadline. Cancellation, limits,
and truthful standard-guidance fallback remain in place; there are no automatic
retries. A safe `AI_TIMEOUT` code reaches the browser so a timeout is explained
specifically instead of being hidden behind the generic unavailable message.
Regression coverage exercises a response arriving after 24 simulated seconds,
the timeout reason, its HTTP propagation, and browser error handling.


After restarting the pilot with this fix, the rendered signed-in workspace
successfully generated and saved Gemini advice for an existing Mealybug Wilt
result using the user's already-enabled preference. The screen displayed the
Google Gemini provider, model, timestamp, and three care actions. All 36 backend
and 51 frontend tests, syntax checks, and the production build pass.


### Fruit Fasciation validation fix on 2026-10-22

The validator rejected the reviewed Fruit Fasciation action reason, “The predicted
disorder concerns growth rather than a confirmed infection,” because its
uncertainty normalization covered negated diagnosis wording but not negated
infection wording. A deterministic test reproduced this mismatch: six classes'
reviewed descriptions/actions passed and Fruit Fasciation alone failed. The
normalization now handles these narrowly negated infection phrases. Affirmative
confirmed-infection claims, new numerical claims, and chemical treatment advice
remain rejected. Regression checks cover all seven classes and the actual
provider-response validation path for Fruit Fasciation.

A separate live synthetic Fruit Fasciation request received HTTP 503 from Google.
Known response-rejection and provider-unavailability codes now reach the browser
alongside the existing timeout code. Unknown errors retain generic wording; raw
provider output is not displayed. The user sees whether advice was rejected,
Google was unavailable, or the deadline expired.


## All-category hardening audit on 2026-10-22

New generations now use `pineapple-care-v3`, with reviewed care steps constrained
in the schema and server validator, guidance for mixed results, clearer
condition-type instructions, robust response parsing, and distinct safe failure
reasons. Compatible saved v2 advice remains readable without consuming quota.
All seven supported classes plus a mixed-result case returned validated live
Gemini advice. Initial connection/provider failures and targeted successful
rechecks are recorded rather than hidden. See the [complete audit and validation
limits](recommendation-audit-2026-10-22.md) and [exact prompt](recommendation-prompt.md).
