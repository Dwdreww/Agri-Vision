# UI revision — 2026-10-08

Implementation resumed after the human’s direct “proceed.” The original exported
file was initially unavailable. A subsequent audit recovered the full plan from
“Thesis Handoff 2”; it is now saved as [the revision plan](ui-revision-plan-2026-10-08.md).
All remaining UI requirements were implemented. See the
[requirement checklist](ui-revision-checklist.md) for the comparison.

## Implemented

- Shared brand subtitle: **Pineapple Health**.
- Calm monitoring layout: concise overview, restrained sage palette, consistent
  typography, clear section hierarchy, light/dark color treatments, and saved
  sample thumbnails on compact scan cards.
- One Activity timeline: Today first, future dates nearest first, then past dates newest first. Scans use creation dates,
  observations use observed dates (creation date fallback), and tasks use due
  dates even after completion. Unknown dates appear last, explicitly labeled.
- Search covers scans, classifications, observations, task titles/notes, plots,
  and farms. Filters cover record type, farm, plot, Today / Last 7 days / Last 30
  days / inclusive custom dates, and category-specific status. Status resets when
  categories change and is hidden for All records. Active filter chips and Clear
  filters remain visible. Archived and Unassigned labels identify older records.
  The timeline loads 50 matches at a time with Load more.
- Condition badges on fresh results, saved cards/details, individual detected
  regions, and the latest plot result. All seven supported model classes appear
  in a new Health guide with category explanations and source links.
- Health guide is reachable from desktop navigation, the phone menu, Overview,
  and Scan. Unknown results and No Detection are Unclassified, never healthy.
- Existing task completion, scan retry/save, sharing/removal controls, private
  photos, and research CSV fallback retain their existing record operations.

Classification mapping and sources: [conditions.md](conditions.md).

## Verification

- Production build passed. Existing large-bundle warning remains.
- Thirteen focused timeline/classification checks passed in Asia/Manila and America/Los_Angeles, including calendar dates,
  due-date placement, inclusive filters, mixed-record keys, search, and unknowns.
- Existing nine service/auth/photo/research checks and function syntax checks passed.
- Actual signed-in workspace checked with existing records: category search,
  task filtering/placement, scan expansion, region categories, and private photos.
  No farm records, scans, tasks, or account permissions were changed for testing.
- A temporary local-only fixture exercised mixed scans/notes/tasks, completed and
  overdue tasks, same-day grouping, archived farms, unknown dates, search-empty
  state, and inclusive date filters. Fixture files were removed afterward.
- Desktop checked at 1280px. Actual app checked in a 375×812 local responsive
  iframe in light/dark modes; Overview, Activity, and Health guide fit without
  horizontal overflow. The phone menu and expandable filters worked. The browser
  viewport capability did not resize the browser, so the iframe provided the
  real 375px document viewport. Temporary browser overrides were reset.
- Appearance preference restored to Device setting after visual QA. Screenshots
  are outside the watched repository in `/tmp/agri-vision-ui-revision/`.

The local pilot services are running on loopback. Billing, hosting, model weights,
backend schemas, and account permissions were not changed by this revision.

## Full-plan audit follow-up

The first implementation followed the abbreviated handoff. The audit restored
missing requirements: date shortcuts, category-specific status/reset behavior,
Today-first ordering, separate completion dates, 50-record pagination, local
midnight refresh, active-filter chips, archived/unassigned labels, explicit View
details, five consistent main navigation labels, and explicit plot action labels.
The added disease classification guide remains a secondary Reference destination.

Browser checks with 123 local sample records confirmed 50 → 100 → 123 pagination,
Today (5 matches), Last 7 days (26), Last 30 days (95), a two-day inclusive custom
range (11), status reset on category change, archived/unassigned labels, and separate
completed/due dates. Existing real scan details preserved filters and row position.
Keyboard Tab order through search → record type → date was verified. Final phone
filters were checked at a true 375px iframe viewport; custom dates automatically
expand the extra controls without horizontal overflow. The original live mutation
checks remain the baseline for unchanged record operations; no real account or
farm records were modified in this audit.
