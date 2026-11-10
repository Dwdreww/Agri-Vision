# AgriVision interface

Updated 4 November 2026. This design replaces the earlier forest masthead, logbook, and copper workspace directions at the user's request. Implemented directly in React and CSS; Taste and Impeccable are not used for this rebuild.

## Navigation and workflow

The everyday navigation has three destinations: Home, Photo check, and Records. Desktop uses a quiet sidebar; mobile uses three labeled bottom links. Growing areas, Settings, and help are secondary utilities. Records contains Photos, Field notes, and Care tasks. Each category has one primary add action. Search stays visible; detailed filters are collapsed.

Home has one photo entry point, recent real records, and outstanding real care tasks. Its photo button opens the device picker and transfers the selected image directly to Photo check. The photo screen combines preview, growing-area selection, and save or model check. Optional details remain collapsed. Progress is descriptive rather than another set of navigation buttons. Guest saves are labeled Not analyzed.

## Visual system

- Pineapple gold: `#edc449` for primary actions with dark olive text `#293522`.
- Leaf green: `#45633c` for navigation, links, and focus; pale green `#eaf1e3` for selected states.
- Soft ivory: `#f6f7f1` page background, white surfaces, olive charcoal `#29372c` body text.
- Quiet text: `#626c60`; borders `#dfe5d8`, stronger control borders `#819073`.
- Dark theme: deep leaf backgrounds `#191f1a` / `#232c24`, pale leaf links `#b9d398`, pineapple gold actions `#efcf77` with dark text.
- Manrope, locally hosted with its OFL license. The new AgriVision wordmark and scan-leaf symbol work on desktop and mobile.
- Flat record rows, modest rounding, clear boundaries, and restrained decoration. Visible keyboard focus, large form fields, and reduced-motion support remain.

The implementation lives in `src/interface.css`. Unused prior stylesheets and prototypes were moved to an external recovery archive during the November 4 cleanup. The welcome page has its own light palette using the same gold and leaf colors. The pineapple photograph is illustrative and makes no model or real-farm claim.

## Verification

See `docs/qa/pineapple-interface-2026-11-04.md` and `output/ui/rebuild-2026-11-04/` for current checks and screenshots. Earlier design reviews describe superseded versions.

## History overview repair — 4 November 2026

History records now open a wide overview with a sticky header and optional
full-screen expansion on desktop. Mobile opens full screen. Condition/context,
photo versions, and recommendations lead; model details and record management
are expandable. Recommendation labels omit AI and generated advice identifies
Google Gemini. See `docs/qa/history-overview-repair-2026-11-04.md`.
