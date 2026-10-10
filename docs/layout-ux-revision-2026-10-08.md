# Layout and workflow revision

Implemented October 8, 2026 (Asia/Manila), following the request to keep the
illustrated field-journal concept while making sections and ordinary tasks easier
to identify. This document supersedes the original Overview arrangement in
[field-journal-design.md](field-journal-design.md).

## Result

- Overview starts with a compact page title, a clear scan/setup action, and real
  summary counts. Growing space, next actions, past records, and reference help
  have distinct sections. The illustration is a small secondary scan callout.
- Plot rows offer **Scan** and **View plot** directly. Small workspaces use a
  full-width callout to avoid a largely empty column; phone/tablet layouts place
  care tasks before plots and keep past records afterward. DOM order also puts
  care tasks first so keyboard navigation follows the phone layout.
- First-farm and first-plot buttons open the relevant form directly. The farm
  selector remains available when more than one active farm exists.
- Farms shows its active plot count, explicit scan/view actions, and a labelled
  Manage control for plot editing and archiving.
- Plot details put **Scan this plot**, **Record observation**, and **Add care task**
  together above the latest model result and personal observation. Entry forms
  open immediately below these actions, focus their first field, and return focus
  to their trigger after saving/cancelling. Only one entry form opens at a time.
- The five page headings match navigation: Overview, Farms, Scan, Activity,
  Settings. Overview's care-task link opens Activity with Care tasks selected;
  ordinary Activity navigation still starts with All records and All dates.
- Scan keeps all five guided steps. Optional observation, research sharing, and
  advice settings are grouped in a disclosure; guidance and private-storage
  context follow the working area. Results receive keyboard focus and scroll
  into view on smaller screens. Starting another scan returns to the plot step.
- Optional AI consent remains explicit, off by default, and available in Settings.
  Result cards put the longer setup explanation behind a labelled disclosure.
- Settings groups Preferences separately from Account & data. Sidebar account
  identification shows the display name and “Private workspace”; the signed-in
  email remains available in Settings.
- A dialog opened from another page restores focus to main content when its
  original trigger no longer exists. Existing focus traps, menu dismissal, and
  reduced-motion handling remain in place.

## Verification

- `npm test`: all 24 frontend checks passed.
- `npm run build`: passed. The existing large-bundle warning remains.
- `git diff --check`: passed; source changes were also checked against the
  pre-revision copies because these frontend files are currently untracked.
- `scripts/verify-local.mjs --keep-ui-fixture`: all 11 live checks passed, including
  actual model inference, private record/photo access, sharing isolation,
  recommendation fallback, and deletion.
- Browser checks used a disposable synthetic account in a separate origin
  (`localhost:5173`) to preserve the user's existing `127.0.0.1:5173` session and
  theme preference. The browser saved two actual scans, an observation, a care
  task, a farm, and two plots. Task completion/reopening and scan restart worked.
- All five main screens fit 1280px desktop, 768px tablet, and 375px phone widths in
  light and dark themes with no horizontal page overflow. An additional 320px
  dark-theme pass covered all five destinations.
- Farm/plot empty states and contextual setup were checked by temporarily
  archiving only the disposable account's original farm, then restoring it.
- Keyboard checks covered navigation focus, scan-result focus, scan restart,
  observation/task entry, dialog Tab trapping, Escape dismissal, and focus
  restoration for dialogs and the phone menu. Audible screen-reader output was
  not independently tested.

Preview screenshots show disposable data, not mockups. They are saved under:

`/Users/andrewvlnz/.codex/visualizations/2026/10/08/agri-vision-layout-ux/`

The principal previews are `overview-final-desktop.jpg`,
`overview-final-light.jpg` (full page), and `overview-final-phone.jpg`.

The disposable test account, its records, private photos, and temporary credential
file were removed after verification. The temporary browser viewport was reset.

No backend, database schema, model, billing, key configuration, or deployment
changes were made. Gemini generation is still unavailable without private
configuration; the real-provider smoke test was not run. Existing standard
scanner guidance remains available.
