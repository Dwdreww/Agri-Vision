# Guided scanning and AI recommendations

This revision keeps the five main destinations, seven model classes, Activity
filters, and existing record/photo/research operations. AI advice is separate
from the model prediction and its existing suggested next step.

## Using the feature

Choose a plot, add or capture a clear photo, review the preview, then select
**Scan Pineapple**. The normal model result saves automatically. Preparing,
analyzing, and saving are separate stages; an AI request never determines whether
a scan can be saved.

The first AI opt-in explains what Google receives and how its free service uses
inputs and outputs. The choice applies to the signed-in account on this device
and can be disabled in Settings. Once enabled, new successfully saved scans can
generate recommendations automatically. Opening scan history retrieves existing
advice without automatically generating more. Advice can be copied or explicitly
regenerated.

Only validated model labels, confidence values, detection count, and model version
may leave the server. Photos, farm/plot names, account identifiers, locations,
notes, and user observations are excluded. Research sharing remains a separate
operation and choice.

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

Recommendations are saved privately beside the scan's local files, rather than
in Firestore. They are tied to this computer, like the existing private photos;
include them in the same private backup. Scan/account removal also removes saved
advice. Existing scan documents, Firestore rules, and research exports keep their
current structure.

The cache depends on the normalized result and model/prompt/schema versions.
Regeneration replaces the cache only after a valid response. Provider failures
retain existing advice and expose clearly labeled standard guidance when needed.
Unknown labels and No Detection are inconclusive, never healthy classifications.
The generative service cannot add disease classes, confidence scores, ripeness,
freshness, or food-safety assessments to the scanning model.

The local service bounds provider calls with a 20-second timeout, one active
generation globally, a 30-second account cooldown, and daily application limits
of 10 attempts per account and 50 overall. Cache reads do not consume these limits.
Provider quota failures remain recoverable and never trigger a paid fallback.

## Local API

Both routes require a valid, non-revoked Firebase Bearer token and read only the
signed-in owner's scan:

- `GET /api/workspace/scans/:scanId/recommendations` reads cached advice; it never
  calls Gemini.
- `POST` to the same route accepts only
  `{ "regenerate": false, "consentVersion": "2026-10-08" }`. Set `regenerate` to
  `true` only for the user's explicit regenerate action. It reads the actual
  saved model result on the server.

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

No Gemini key is configured, so generation is unavailable in the running pilot.
Provider behavior, malformed responses, timeouts, limits, deduplication, failed
regeneration, cancellation, and deletion races were tested with mocked responses.
After private configuration, complete one real text-only provider smoke test;
that test remains pending and was not represented as passing.
