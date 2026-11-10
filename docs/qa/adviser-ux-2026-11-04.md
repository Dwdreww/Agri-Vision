# Adviser feedback: workspace usability — November 4, 2026

The user confirmed this is a mobile web system that must work on desktop and phone. Their adviser's concerns were duplicate image actions, confusing organization, layout, and the overall palette.

## Implemented behavior

- Main destinations: My records, Add photo (guest) / Scan pineapple (signed in), My farms, Settings. Health guide and Help remain available. The main page has a stable title and shows the selected farm/area beneath it.
- One native Choose photo control replaces the separate Add photo, Upload image, and live-camera choices inside the scan screen. After selection, the same entry point becomes Replace photo. A phone's native image picker may offer camera and library; availability depends on the browser/device. Drag and paste remain supported.
- Existing photo review, model inference, save, deletion, recommendation consent, and detection overlays retain their service checks. Guest photos remain Not analyzed. Demo results remain unsaved.
- Write note and Plan care are directly available. Record categories use the same order on desktop and mobile: All records, Photos, Field notes, Care tasks. On a phone, date/farm/area filters are inside Filters, beside search.
- Guest photo details omit inapplicable model statistics, confidence explanations, AI advice, and research sharing. Photographs, independent reported observations, follow-up guidance, deletion, and storage context remain available. Analyzed records retain their details.
- A neutral navigation surface replaces the saturated leaf-green strip in the working app. Forest branding remains. Geist handles working headings, and spacing, text sizes, control borders, touch targets, focus, and light/dark colors are consistent.
- Ordinary workspace pages have URL state and normal navigation links. Browser Back/Forward and refresh restore the page. Research access remains gated and is not inferred from a URL. Category/search filter persistence in the URL is outside this change.
- Help/setup/welcome entry labels and Filipino translations match the new navigation. The welcome composition is retained.

## Validation

`npm test`: 61 passing tests. The navigation test covers normal page links, deployment paths, entry mode, area scope, and rejection of privileged view names. Existing tests cover activity categories, dates, persistence, safe confidence handling, translations, and AI consent.

`npm run build`: passed. The existing large-chunk warning remains; no dependency or framework migration was introduced. Build log: `output/ui/adviser-ux-2026-11-04/build.log`.

Browser QA used a temporary IAB tab against local Vite, without the owner's account. The illustrative pineapple photo is the existing `assets/plates/preview-photo.webp`; the added note/task explicitly say UX review sample. Their three records are local QA data, not real grower records or model evidence.

Verified through UI:

1. Exactly one Choose photo button before selecting an image; Replace photo afterward. At 390×844 its top is approximately 525px, within the first viewport.
2. Select photo → Review photo → Save photo → saved Not analyzed record → find/open photo in My records.
3. Write and save a note; plan and save a care task; complete and reopen that task.
4. Category filtering and counts; search with zero matches and Clear filters; date preset and expandable farm/area filters. Native date-input filling through the browser tool did not commit React state, so custom-range entry was not claimed as a browser pass; the existing date validation tests pass.
5. Browser Back and page refresh restore the expected ordinary page, with guest data retained.
6. English/Filipino and light/dark changes; menu opens and Escape closes it, restoring focus. Original Device setting and English preferences were restored after QA. A clean reload followed by Settings navigation and browser Back produced no new console errors; earlier hot-refresh warnings during editing were excluded from that clean check.
7. No page-wide horizontal overflow at 320, 390, 768, and 1440px in the inspected record views. The desktop title uses loaded Geist at 30px.
8. Isolated demo fixture uses the real ScanView and WorkspaceServices with a simulated local model response. It verifies the Photo → Check → Result interface, honest no-detection state, unsaved-demo notice, and result layout without live inference or AI calls. It is not evidence of model accuracy. Its source is under the QA output folder and is not a production entry.

Calculated contrast pairs: muted text on the light ground 5.54:1, white primary-action text on working green 6.74:1, dark-theme secondary text on its surface 8.83:1, and dark-theme primary-action text 8.51:1. Controls use a darker border than the initial candidate to clear 3:1 on white. Disabled controls retain their distinct disabled treatment.

## Design checks and evidence

Applied design-taste-frontend app-screen rules and Impeccable Operate/distill/clarify/polish guidance. Installed Vercel's `web-design-guidelines` skill into `/Users/andrewvlnz/.codex/skills/web-design-guidelines` using the Skill Installer and applied its interaction/accessibility checks. Skill source: <https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines>.

Taste app guidance: editorial-greeting, seed 1451481528, palette/type kept from brand; the established noun title and task composition take precedence over a generic greeting. The product's dated photo/observation/care relationship is its distinguishing structure. No new proof, farm claims, or user data were invented.

Taste source lint: 0 failures; one warning about the menu's functional Help & reference group label. That label groups navigation rather than decorating a heading. The Impeccable detector ran once and reported 32 type-ramp advisories against the previous DESIGN.md, with no non-advisory findings. The current working type scale is documented as part of this change. The browser was inspected through the required CUA tool, so the skill's separate browser-launching inspector was not run.

Screenshots and test logs are in `output/ui/adviser-ux-2026-11-04/`. Main captures: `records-desktop.png`, `records-mobile.png`, `records-tablet.png`, `records-narrow.png`, `scan-mobile.png`, `photo-details-mobile.png`, `mobile-filipino.png`, `records-mobile-dark.png`, `workspace-menu-mobile.png`, `model-result-desktop-fixture.png`, and `model-result-1280-fixture.png`. The before-mobile capture has a scaling issue and is weak comparison evidence. Before/after record counts differ because the workflow test created the three QA records.

## Practical limits

This is a local implementation. No Vercel/Hugging Face deployment, photo migration, paid service, live Gemini request, Git commit, or push is part of this pass. A real phone should still verify its native camera/library picker. The adviser and representative growers should try the redesigned workflows; technical checks cannot establish that the system is easy for them to use.

The independent review found no material implementation defect in the reviewed screens and requested documentation alignment only. That correction was scored resolved in `output/ui/adviser-ux-2026-11-04/finish-verdict.md`, with disposition `ship` at the documentation-fix scope. The initial implementation review and its evidence limits remain in `finish-review.md`. DESIGN.md, .impeccable/design.json, and the confirmed product requirements now match the implemented working app.
