# Model reset — November 2, 2026

This records the reset at that date. The replacement classifier was paired on
November 3 after its training script and class mapping were supplied. See
[the current model inventory](../models/README.md); removed weights remain absent.

The user requested removal of the current EfficientNet and oldest YOLO model,
while retaining the supplied YOLOv8m and providing a new EfficientNet later.

## Current state

- Deleted root-level `efficientnetB0.pth` and `yolov8.pt`.
- Renamed the unchanged supplied detector from `models/yolov8m-test.pt` to
  `models/yolov8m.pt`. It is the only remaining `.pt` / `.pth` file in the checkout.
- Removed the EfficientNet construction, checkpoint loading, output class list,
  transforms, crop classification, condition aggregation and legacy detector path
  from the active backend. No replacement classifier was guessed or installed.
- YOLO uses the full photo and its standard input preparation. The previous
  classifier-specific contrast/segmentation pipeline no longer runs for new scans.
- Docker, local startup and `test_pipe.py` use the retained detector only.
  The `pilot:legacy` command was removed.

## Prediction and interface contract

The profile is `yolov8m-detection-only`. The model version is
`detection-only-yolov8m-5d4a90cdc7a2-v1`. Health reports the detector ready, the
classifier not ready, and `active_classifier: null`.

New scans show **Detection only**, **Classifier not installed**, and YOLO's
numbered regions and confidence. They return `top_confidence: null`, nullable
condition/classifier fields per region, and `classification_available: false`.
Detector confidence has its own field and is never reused as condition confidence.
No detections remains inconclusive; detection does not imply healthy or diseased.

Mode and classifier availability are saved with new records. Historical records,
photos, class mappings in the reference catalogue and cached advice retain their
original meaning. No historical account data was deleted or rewritten.

New detection-only records do not auto-request Gemini condition advice. Server-side
normalization ignores condition labels/scores on explicitly detector-only records
and rejects sending them to Gemini. Research sharing continues to require a valid
classification confidence; older classified records remain supported.

## Verification

- 8 Python scanner tests passed with the old weights absent, including actual CPU
  inference, valid/clipped/invalid regions, null classification scores, health and auth.
- 60 frontend tests and 64 server tests passed, including detector-only state across
  saving and provider exclusion. Server syntax checks and production build passed.
- 11 live end-to-end checks passed using disposable accounts, including signed-in
  YOLO-only inference, saved mode/null confidence, private photos, rejection of
  unclassified research sharing, historical sharing compatibility and cleanup.
- The live health endpoint confirmed YOLOv8m active and no active classifier.

The Docker recipe was updated but a Docker image was not built in this session.
This work does not measure pineapple detection accuracy or train a new model.
