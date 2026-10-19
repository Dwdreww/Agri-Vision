# Guided ribbon design — selected concept B

The October 19 [farmer guidance revision](farmer-guidance-2026-10-19.md) retains
this visual style and updates the starting page to Overview, simplifies labels,
and adds optional setup guidance plus English / Filipino selection. The notes
below describe the October 10 release.

The user selected **B, Guided ribbon**, after comparing three interactive layouts. It supersedes the October 8 illustrated field journal. The agreed direction is crisp and professional, minimal with purposeful motion, with equal attention to phones and desktops.

## Interface

React remains the application framework. Tailwind CSS 4 is integrated through the Vite plugin for responsive layout utilities; CSS defines the shared palette, typography, components, ribbon, photo hover, scan sweep, and disclosure transitions. No remote fonts or animation library are needed.

The scanner is the initial signed-in destination. Desktop primary navigation runs across the top; phones use a five-item bottom bar. The workspace menu provides help, health references, account actions, and role-gated research access. Overview uses compact counts, plot rows, care tasks, and recent records. Farms, plot detail, Activity, Settings, help, and sign-in share the same forest-green and neutral visual language.

Scanning has three real steps:

1. **Add & preview:** upload, camera, drop, or paste one photo; choose an active plot. Continue requires a prepared photo and a plot.
2. **Scan the fruit:** review the photo and destination, optionally add an observation, research sharing, or AI consent, then run the existing authenticated backend model. Returning to the first step retains the photo and plot.
3. **Review & care:** show the actual class, condition type, valid confidence, detected regions, and standard next step. Open the detailed report for the annotated photo, model version, detection details, preprocessing, and confidence explanation.

Results still save automatically. A failed save keeps the completed result visible with a retry action; retry saves the same result without repeating inference. Optional Gemini advice uses the saved backend result through the existing consent and availability checks. It never replaces classification or fabricates a response while unavailable. Cloud activation and the later trained model rollout are separate deployment work.

## Accessibility and deployment

Keyboard focus moves to each step heading; disclosures use native details/summary. Dialogs trap focus and restore it on closing. Reduced-motion preferences disable the ribbon transitions, hover movement, scan sweep, and entrance effects. Light, dark, and device themes remain available.

The frontend is published through GitHub `main` and the existing Vercel project. Production stays in monitoring mode until public inference and cloud photo storage are deployed. No backend model, data schema, billing, credentials, or consent policy changed.

## Verification

- Production build and `git diff --check` pass. The existing large JavaScript bundle warning remains.
- All 24 frontend and 31 function checks pass, as do the function syntax checks.
- All 11 live service checks pass: real inference, private record/photo ownership, consent and missing-key behavior, sanitized research sharing, revocation, and cleanup.
- Chrome browser review covered desktop (1280px), tablet scanner (768px), and phone (375px). The five main destinations, plot detail, help, health guide, and expanded scan report fit the tested phone width without horizontal page overflow. Both light and dark themes were reviewed.
- Pasting the repository sample photo used the real preparation pipeline. Continue requires a photo and plot; Back preserves both. Actual authenticated inference moves to Review & care and saves the result. A deliberately blocked save for the disposable account kept the result visible; unlocking and Retry saving stored it without another inference request.
- The detailed report opens the real annotated image, model/version, detected regions, preparation summary, and confidence explanation. The saved plot timeline and private sample thumbnails also render.
- The optional introduction, step-heading focus, farm-dialog Escape/focus restoration, workspace-menu Escape/focus restoration, and reference navigation were checked.
- Menu sign-out closes the drawer before ending the session; the sign-in page returns with scrolling restored. The obsolete mobile-only menu resize handler was removed because the menu now works on every viewport.
- Reduced-motion support was reviewed in CSS. Audible screen-reader output and camera permission/capture were not independently retested. Chrome extension file-picker automation required file-URL access, so photo preparation and scanning were exercised through the supported clipboard input instead.

The disposable QA account, its records, and its photos were removed after verification. Existing user accounts and records were not changed.

Screenshots use a disposable synthetic account and the repository's sample pineapple photo. They are saved outside the repository under `/Users/andrewvlnz/.codex/visualizations/2026/10/10/agri-vision-guided-ribbon/`. Prototype code and unused variants were removed; historical comparison screenshots were retained.

## Scan record layout correction — 2026-10-10

The recent scan list lost its thumbnail constraints during stylesheet consolidation. In the flex header, a loaded photo could consume the available width, leaving a condition title with zero usable width. The reproduced cards were 1,320 and 1,430 pixels tall. Missing shared badge and icon rules also weakened the visual hierarchy.

Scan headers now reserve a separate media column: 72 pixels on desktop and 60 on phones. Dates and farm/plot context use separate lines. Confidence and detection counts sit with the report toggle in a wrapping footer. Long names stay fully readable, and full photos remain available in the expanded report. Status badges, farm/plot icons, and empty states have shared base styles again. The same record structure serves Overview, Activity, and plot history.

Overview follows the same reading and keyboard order: care tasks, plots, then recent scans and observations. Recent scans get the larger desktop column, tablet sections stack, and compact scan rows use separators instead of nested cards. The repeated scanner promotion was removed. Report photos and technical fields stack in a single column on phones.

The browser regression checks reproduced the original failure and verified the final layout at 1280, 1024, 768, 375, and 320 pixels. Checks covered long condition names, 480×960 and 1600×480 saved photos, and a result without a photo or valid confidence. No horizontal overflow, clipped headings, photo/text collisions, or title/button overlaps occurred. Recent titles retained at least 162 pixels of width; collapsed records stayed below 300 pixels on the smallest phone. The measured results are saved as `layout-checks.json` beside the screenshots.

All five primary views, Activity scan rows, and plot history were checked at 375 pixels. Report controls open and close with Enter, expose their expanded state, and point to the rendered details. Expanded reports also fit 320 pixels. Light and dark themes were reviewed. The production build, all 24 frontend tests, and whitespace checks pass. No backend contracts or existing user records changed. The disposable layout account and its synthetic records/photos were removed after verification. This correction is included in the guided ribbon frontend release; public inference and Gemini remain separate deployment work.
