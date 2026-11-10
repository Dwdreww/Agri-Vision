# YOLOv8m scanner test — October 27, 2026

> Historical record. On November 2, 2026, the old classifier and original detector were removed. Current setup: [model reset](model-reset-2026-11-02.md).

This is a wiring test using the exact file supplied as `Downloads/yolov8m.pt`.
It is byte-identical to the earlier `Train model.pt`. It has 80 COCO object labels,
not pineapple condition labels. No new pineapple disease model was trained or supplied.

## Location and selection

- Original supplied detector copied to `models/yolov8m-test.pt`.
- SHA-256: `5d4a90cdc7a21786cc59cd19778e9eafff836df9e2da32524737c7ee6efe4fe5`.
- The local pilot (`npm run pilot`, Node 22) now selects `SCANNER_PROFILE=yolov8m-test`.
- `npm run pilot:legacy` selects the existing pineapple detector.
- Direct Flask/container startup defaults to `legacy`; opt into the test with
  `SCANNER_PROFILE=yolov8m-test` and include the test weight file.
- `YOLO_MODEL_PATH` can override a profile's location. Test loading still enforces
  the reviewed checksum. Missing/changed artifacts fail startup instead of falling back.
- Existing `yolov8.pt` and `efficientnetB0.pth` remain in place.

## What runs

1. Signed-in upload uses the existing authenticated prediction endpoint.
2. Test YOLO receives the original image, with Ultralytics' standard 640-pixel
   letterboxing and normalization. The existing contrast/segmentation outputs are
   still produced for explanation and classifier crop preparation.
3. YOLO's boxes select candidate crops. Its original COCO label and class index
   are preserved on each detection as `detector_class_name` and `detector_class_id`.
4. Existing EfficientNet-B0 assigns each contrast-enhanced crop one of the existing
   seven condition labels. A Fruit Rot, Multiple Crown, or No Disease result
   comes from this classifier, not from the supplied detector. No labels are forced.
5. Existing annotation, result display, photo saving, history and recommendation
   contracts continue. Test results use a `Test result` / `monitor` status and an
   explicit testing message, including when a condition score is returned.
6. If YOLO finds nothing, the scanner returns `No Detection`; it does not invent
   boxes or silently classify the full photo. This can happen on pineapple photos.

The test model version includes both weight hashes and a pipeline revision.
It is returned by health and prediction endpoints, saved by the existing scan
record mapper, and displayed in result/history details. The testing message is
saved with the record too. Existing records keep their own original versions.

## Loading and verification

The test checkpoint is loaded on CPU with `weights_only=True` and a fixed list of
reviewed PyTorch/Ultralytics classes. Its state dict is loaded strictly into the
installed YOLOv8m architecture; no unrestricted pickle fallback is used for it.

Run `.venv/bin/python -m unittest discover -s test -p 'test_scanner.py'` for the
scanner regression tests. Run `node scripts/verify-local.mjs` (Node 22) with the
full pilot running for authenticated inference, save/read, privacy and cleanup.
These are integration checks, not measurements of pineapple classification accuracy.

## Verified in this integration

- 8 Python scanner tests passed, including actual CPU inference, actual blank-image
  inference, checksum rejection, all seven classifier-to-label mappings using
  deterministic logits, invalid boxes, upload handling, JPEG output and auth boundaries.
- 54 existing frontend tests passed; production build passed with the existing
  large-chunk warning.
- 11 live pilot checks passed using disposable QA accounts: signed-in prediction,
  private photo upload/read, record persistence, ownership protection, recommendation
  read/fallback paths, research opt-in/revocation and cleanup. QA accounts were removed.
- The existing sample pineapple photo returned zero regions with the supplied detector.
  This verifies the honest no-detection path; it does not establish disease accuracy.
- The legacy profile still ran the existing sample and returned one region classified
  as Fruit Fasciation Disorder. This is a rollback smoke test, not ground-truth validation.
- After restart, frontend-proxied health confirmed the test profile, its distinct version,
  CPU execution, and authenticated scanner readiness.

Additional smoke checks on the existing generated design images completed: preview-photo
returned zero regions; crown returned one region (COCO bird → EfficientNet Crown Rot,
51.7%); field returned one region (COCO person → EfficientNet Root Rot, 67.6%). These
exercise both actual models and annotations, not labeled disease validation. The COCO
labels show the expected semantic limitation of this placeholder detector.
