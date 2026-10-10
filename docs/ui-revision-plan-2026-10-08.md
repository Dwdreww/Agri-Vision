# AGRI-VISION interface and Activity revision

## Summary

Replace **“Field intelligence”** with **“Pineapple Health”** wherever the shared branding appears.

Redesign the system as a clean monitoring tool, with compact records, consistent labels, restrained colors, and a combined Activity list organized by date.

## Interface and visual changes

- Use neutral backgrounds, dark text, and deep green for primary actions. Reserve amber and red for attention states.
- Replace the oversized greeting banner with a compact page heading, useful summary counts, and a clear next action.
- Use one consistent typeface, smaller corner radii, subtle borders, and minimal shadows. Use actual scan photos where they help explain a record.
- Keep five main destinations: **Overview, Farms, Scan, Activity, Settings**, with consistent desktop and phone labels.
- Make plot actions explicit: **Scan this plot**, **Record observation**, and **Add care task**.
- Guide new accounts through **Add farm → Add plot → Start monitoring** using contextual buttons and short instructions.

## Combined Activity list

- Default to **All records** and **All dates**, replacing the three separate lists with one list.
- Group records under clear headings such as **Today · October 8, 2026**. Show today first, future dates nearest first, then past dates newest first.
- Use each record’s relevant date:
  - **Scan:** date the scan was saved.
  - **Observation:** observation date entered by the user.
  - **Care task:** due date, as selected. Completing a task keeps it in that date group and displays its completion date separately.
- Desktop rows show category, farm/plot, summary, and status. Phone rows stack the same information.
- Give each category distinct content: scan result and confidence, observation condition and note, or task title and completion control.
- Keep photos and detailed scan information behind an explicit **View details** button. Expanding details preserves filters and position.

Add these filters:

- **Record type:** All, Scans, Observations, Care tasks.
- **Date:** All dates, Today, Last 7 days, Last 30 days, or an inclusive custom range.
- **Farm and plot:** changing the farm resets an incompatible plot selection.
- **Search:** match farm/plot names, scan results, observation notes, and task titles.
- **Category-specific status:** scan result, observation condition, or Upcoming / Due today / Overdue / Done for tasks. Hide this filter when viewing All records and reset it when switching categories.

Show the matching record count, active filters, and **Clear filters**. Include archived records with an Archived label and imported scans with an Unassigned label. Render 50 matching records initially, with **Load more**.

## Implementation and compatibility

- Build a read-only Activity adapter from the existing scan, observation, and task records. Normalize category, date, context, summary, and status without changing stored data.
- Use local calendar dates consistently. Treat observation and due-date values as date-only values to prevent timezone shifts.
- Recalculate Today, Due today, and Overdue when the local date changes.
- Reuse existing private-photo access, sharing, deletion, and task completion operations.
- Keep model predictions and user observations clearly distinguished; confidence remains labeled **Model confidence**.
- No backend API changes, database migration, new paid services, or billing upgrade are required.

## Verification and acceptance

- Verify branding on login, desktop navigation, and the phone menu.
- Test combined grouping across today, future dates, past dates, and month boundaries.
- Confirm task completion/reopening updates status without moving its due-date group.
- Test combined filters, inclusive date ranges, category switching, archived/unassigned records, empty results, and Load more.
- Verify details, photos, sharing, deletion, and task controls still work.
- Review light and dark themes at desktop and phone widths, including keyboard navigation, readable contrast, and no horizontal page overflow.

The revision is successful when a user can find a dated record, understand its category and status, and identify the next action without needing a walkthrough.
