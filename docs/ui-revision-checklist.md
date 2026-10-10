# Full UI revision plan checklist

Source: [original plan recovered from “Thesis Handoff 2”](ui-revision-plan-2026-10-08.md).
Implementation and audit: 2026-10-08, Asia/Manila.

| Requirement | Final implementation / evidence |
| --- | --- |
| Pineapple Health branding | Shared Brand used by login, desktop sidebar, and phone menu. |
| Clean monitoring style | Compact heading/counts, one typeface, restrained palette, subtle borders, small radii, minimal shadows; saved sample thumbnails in Overview. |
| Five consistent destinations | Overview, Farms, Scan, Activity, Settings on desktop and phone; Health guide and approved Research are secondary references. |
| Explicit plot actions | Scan this plot, Record observation, Add care task. |
| Contextual onboarding | Add farm → Add plot → Start monitoring steps; contextual empty-state buttons and plot instructions. |
| All records / All dates defaults | Verified in browser with a mixed 123-record local fixture. |
| Today / future / past ordering | Today first, future nearest first, past newest first; month boundary unit check and browser fixture. |
| Relevant record date | Scan saved date, observed date, task due date; date-only values keep their local calendar date. |
| Completion dates separately | Tasks remain under due date; Done and Completed date appear separately. Completion/reopen invariants checked with record snapshots. |
| Category, context, summary, status | Each entry shows its category and farm/plot; scan result/confidence, observation condition/note, or task title/status/control. Phone entries stack. |
| Explicit View details | Photos/details stay behind View details in Activity; existing private photos load. Expansion/collapse retains filter selections and row position. |
| Date shortcuts and custom bounds | All dates, Today, Last 7 days, Last 30 days, inclusive custom range; browser counts and unit checks. |
| Farm / plot filtering | Incompatible plots reset; compatible plots remain selected; archived context remains selectable. |
| Cross-category search | Farm/plot, scan result/type, notes and task title searchable. |
| Category-specific status | Scan Healthy/Risk/Monitor; observation Normal/Concerning/Unsure; task Upcoming/Due today/Overdue/Done. Hidden for All records, resets on category switch. |
| Count / active filters / reset | Matching count, showing count when paged, named filter chips, Clear filters. |
| Archived / Unassigned | Visible badges; unknown dates remain explicitly labeled. |
| Load more | Initial 50, then 100, then all 123 fixture records; filtering resets the display limit. |
| Local midnight refresh | Activity/Overview/Plot date hook refreshes at next local midnight and on focus/visibility changes. Pure date/status checks cover rollover. |
| Existing operations preserved | Existing private-photo, sharing, deletion and task mutation functions are reused unchanged. Existing nine focused service checks pass. Prior live mutation/browser checks remain the baseline; no live mutation rerun was needed for label/filter changes. |
| Model / user observation distinction | Separate cards and labels; Model confidence remains explicit. |
| No backend/schema/billing changes | UI-only adaptation of existing records; free local pilot retained. |
| Desktop/phone, light/dark, keyboard | Desktop and 375px responsive frames reviewed; no horizontal overflow; filter keyboard order checked; existing focus outline retained. |
| Added condition classification | All seven supported labels, physiological/pathological/no-disease categories, Unclassified fallback, source-linked Health guide. |

Validation: production build passed (existing bundle-size warning); 13 frontend
checks passed in both Asia/Manila and America/Los_Angeles, and 9 existing service
checks passed. Tests of completion/reopening use synthetic record states; fresh
live mutation tests were intentionally not repeated against the real account.
