# Paired model integration — November 3, 2026

The local scanner runs YOLOv8m and the replacement EfficientNet-B0 together.
Profile: `yolov8m-efficientnet-b0-regions`.
Model version: `yolov8m-5d4a90cdc7a2-effnetb0-43adddf64b22-roi-v1`.
The supplied metrics establish the output order and preserve `mutli_crown` as
the raw fourth label. See [artifact inventory](../../models/README.md).

Validation completed:

- 16 Python model/backend tests: both reviewed checkpoints, class mapping,
  strict loading, RGB normalization, actual inference, clipped and overlapping
  crops without annotation contamination, separate scores, all four labels,
  invalid-score rejection, no-region behavior and authentication contracts.
- 60 frontend tests, 64 service tests, function syntax checks, production build,
  and `git diff --check` pass. The existing large-chunk build warning remains.
- 11 live checks through the local Vite proxy: real authenticated paired
  inference, saved detections and confidence scores, private photos, sanitized
  research sharing, historical classifications, detection-only compatibility,
  revocation and deletion. Disposable QA accounts and records were cleaned up.
- Browser component preview renders actual model output from the existing
  `assets/plates/crown.png` visual fixture. Region selection and Original
  photo / YOLO regions toggles work. The detector-label row is absent. The
  classifier prediction and both confidence values are readable at desktop and
  390-pixel phone width. Temporary viewport overrides and browser tabs were cleared.

The preview uses the actual `DetectionViewer`, `PredictionDetails`, condition
badge and confidence help components; it is not a full signed-in browser scan.
Authenticated inference, persistence and privacy were checked by the live script.
Screenshots and the example response are under
`output/paired-model-2026-11-03/`.

These are functional integration checks, not an accuracy evaluation. The visual
fixture is not a held-out labeled crop. The supplied generic COCO detector is
still a testing placeholder and its boxes are not confirmed lesion boundaries.
The supplied metrics report 14 validation samples; their reported 100% score
has not been independently reproduced. No live Gemini request was needed for
this integration. Public hosting and a Docker image build were not performed.
