# History overview, photos, and recommendations — 4 November 2026

## Request

The user supplied a screenshot of a photo record whose heading and context wrapped
into an extremely narrow column. They requested corrected framing, a fully
clickable and expandable history overview, visible history photos, working
recommendations, and removal of the word AI from recommendation labels while
retaining Gemini as the provider. Taste and Impeccable remain excluded.

## Reproduction and diagnosis

- Opened the signed-in local Records screen and the same latest Fruit Rot record.
- Measured `.scan-card-title` at 44 px inside a 550 px header. The inspector hid
  the icon while retaining the two-column scan header. The remaining title was
  automatically placed in the 44 px media column.
- All history thumbnails failed with the workspace unavailable message, and the
  recommendation read showed the exact reported temporary-unavailable error.
- `/api/workspace/health` returned HTTP 500. Only the standalone Vite frontend
  was running; the private workspace service and scanner were stopped.
- Ranked causes: missing workspace process for both data failures; grid placement
  for the squeezed layout; separate Gemini configuration/provider failure if it
  persisted after restoring the service.
- Restarted with `node scripts/start-local.mjs` (the `npm run pilot` entry point).
  Workspace health returned HTTP 200 with photos and recommendations enabled.
  All 15 existing history thumbnails loaded. No photo migration was needed.
- Gemini private configuration was present. A single synthetic Fruit Rot provider
  check returned HTTP 200, confirming a separate provider/configuration failure
  was not the cause.

## Changes

- History rows remain whole-row buttons and now open a centered, wide record
  overview. The title uses its own full-width layout, rather than the media grid.
- Added a desktop full-screen Expand/Restore control. Phones use a full-screen
  overview automatically. Header controls remain visible while content scrolls.
- Grouped condition, context, confidence and detection count at the top. Photos
  and recommendations are together on desktop and stacked on phones. Model/scan
  details and record management remain available as expandable sections.
- Contextual Write note and Plan care actions remain available. Other ScanCard
  callers retain their existing expand/collapse behavior.
- Full photo views have Retry photo; failed images retry when photo service
  availability returns. Already loaded photos remain visible during a service
  availability change. Thumbnail buttons do not contain nested retry buttons.
- Recommendation reads recover after the service returns. Already displayed
  advice is retained during an outage. Proxy failures have a clear, safe message
  that the saved scan remains safe, without exposing raw server output.
- Replaced active user-facing AI recommendation labels in headings, settings,
  copied text, helper messages, and English/Filipino strings. Generated results
  identify their source as Powered by Google Gemini. Consent, provider, model,
  error-code protocol, and existing data exclusions remain intact.

## Verification

- 62 frontend tests pass, including a new proxy-outage regression. It failed
  before the error-message fix and passed afterward for HTTP 500, 502, and 504.
- 71 server tests pass. Production build passes with the existing large chunk
  advisory. Selected tracked-file whitespace checks pass.
- The actual signed-in history record loaded its crop and original photo. All
  15 history thumbnails loaded after the service was restored.
- Clicked a thumbnail to open the record; keyboard Enter also opened it. Escape
  closed it and restored focus to the selected history row.
- The desktop overview measured 1120 px, with an 832.8 px title area. Expand
  filled the 1280 × 900 viewport; model details expanded correctly.
- At 390 px and 320 px, the overview content had no horizontal overflow. The
  title no longer broke into the tiny column from the supplied screenshot.
- English/dark and Filipino/light were checked. The original English/dark
  preferences were restored. Original photo and YOLO crop toggles both worked.
- Write note opened the editor with the correct growing area. The empty editor
  was closed without saving a new record.
- In the signed-in history record, the existing enabled Regenerate action made
  one real request, returned Google Gemini advice, and saved it. Reopening the
  record retained the new recommendation and generation timestamp. The provider
  shown was gemini-3.5-flash-lite. No photos, farm names, notes, or account details
  were sent to Gemini; only existing normalized prediction metadata was used.

The one regenerated local recommendation cache is the only intentional change
to a user record's displayed recommendation during verification. No photos,
records, tasks, or observations were deleted or migrated. No production deploy
was performed. The full local pilot is left running. On restart, use
`npm run pilot` so photo and recommendation services run alongside the frontend;
standalone Vite is only a frontend preview.

## Evidence

`output/ui/history-repair-2026-11-04/` contains:

- desktop-overview.png, mobile-overview.png, mobile-recommendations.png
- mobile-filipino-light.png, history-photos-restored.png
- gemini-check.json (one synthetic provider call; no private records)
- outage-regression-before.log, outage-regression-after.log
- frontend-tests.log, server-tests.log, build.log, pilot.log

The browser test used existing owned history records. It verifies data access,
layout, interactions, and recommendation generation, not model accuracy.
