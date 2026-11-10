# Bounding-box photo reference — 5 November 2026

The shared scan photo viewer now opens in **Bounding boxes** mode. Each valid
YOLO region has a gold outline with a dark border and a matching region number
on the original photo. The selected region has a stronger outline; all other
regions remain visible. Numbers render above the outlines when boxes overlap.

**YOLO crop** still shows only the selected rectangular crop, and **Original
photo** shows the unmarked full photo. Selecting a region keeps the current box
or crop view. Selecting a region from the original view opens the box reference.
The original image is explicitly hidden in crop mode so its display styling
cannot override the HTML hidden attribute.

The same component serves new scan results and saved scan overviews. English
and Filipino labels are provided. Existing detections and photo coordinates are
reused; inference, crop inputs, thresholds, storage and saved predictions do not
change. Results without valid coordinates never receive fabricated boxes.

## Verification

- Production build passed. The existing large JavaScript chunk warning remains.
- Eleven existing coordinate, confidence and language checks passed:
  `node --test test/detection-regions.test.js test/i18n.test.js`.
- `git diff --check` passed.
- Browser verification used the real shared component in an isolated, ignored
  local fixture. The existing pineapple integration result produced one box
  on the 690 × 516 original; its crop used `30 84 425 432` as the SVG viewBox.
- Original photo hides both boxes and crops. Region selection preserves the
  chosen crop or highlights its box. Space and Enter activate the view controls.
- Synthetic fixtures covered three overlapping regions, clipped image-edge
  coordinates, portrait and wide images, no detections, historical missing
  coordinates and an uncertain classification.
- At 1280 px desktop and 390 px phone widths, the photo and box SVG have matching
  display dimensions with no horizontal overflow. Filipino phone controls remain
  at least 44 px tall; the dark theme retains visible gold outlines and numbers.
- No warning or error entries were recorded by the browser during these checks.
  No account or guest records were created, modified or deleted for verification.

Browser evidence and the isolated fixture are in
`output/ui/bounding-box-reference-2026-11-05/`. `reference-preview.png` shows
the actual integration result; synthetic fixtures are explicitly labeled.

## Deployment

The protected Vercel preview reached READY and its HTML was verified through
the owner's CLI. Production deployment `dpl_GA4nh4HGrPgF3ym8LK2v2L6doKGy` reached
READY at https://agri-vision-eosin.vercel.app/. The public page returned HTTP 200,
and its workspace bundle contains the default box view, numbered overlay and
separate number layer. The deployed app also opened successfully in the browser.
The deployment receipt and public asset verification are recorded alongside the
browser evidence. Signed-in inference and record mutations were not performed.
