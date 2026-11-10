# Active model inventory

The active pair is `bestv4.pt` YOLOv8m and
`efficientnet_pineapple_bestv2.pth` EfficientNet-B0.

| Active artifact | SHA-256 |
| --- | --- |
| `bestv4.pt` | `f53a9470b13c1e41e4821ce0622c38676fe4e4c48c7d63dbc355002631b53826` |
| `efficientnet_pineapple_bestv2.pth` | `03af1ac8bba3d0f65f318a5fbf1cb4f57cdbc7374e4d44f2c0708d8ff3fee42d` |
| `efficientnet_metrics.json` | `82cd3f16bdfc97cd8b3c03c78dcdc702a947a211510bc4426e116f86625ee111` |

## Detector and loading

The user supplied `Downloads/bestv4.pt`. It strictly matches the installed
YOLOv8m architecture, with 25,856,899 parameters, 640-pixel input, and one class:
index 0, `item`. Its label selects a candidate region, not a condition.

Loading verifies the exact checksum, uses PyTorch `weights_only=True` with a
fixed allowlist, checks finite weights, and strictly copies the state into the
installed one-class architecture. Checkpoint configuration is not used to build
executable model code. `bestv3.inspection.json` records the superseded detector.

The default detector confidence threshold is **0.65 (65%)**, as requested on
4 November 2026. `YOLO_CONF_THRESHOLD` can override it at startup.

EfficientNet accepts a crop classification only when its maximum softmax score
is **at least 0.35 (35%)**, configurable with `EFFNET_CONF_THRESHOLD`. Below that
threshold the crop remains visible as **Uncertain**, without a condition index or
label. Raw confidence is retained for review. No Detection still means no boxes.
A low-confidence crop prevents an overall Healthy summary when other crops are
No Disease. Accepted disease/disorder regions retain summary priority.

## Two image versions and classification

1. **Original:** the unannotated decoded input, returned as a JPEG for reference.
   The uploaded/prepared source continues to be saved through the existing photo
   storage path. EfficientNet never receives the full original as a fallback.
2. **YOLO crops:** one rectangular image per valid detected box. Box coordinates
   are clipped to image boundaries, with floor for left/top and ceil for right/
   bottom. The upper bounds are exclusive array indices. Everything outside each
   box is discarded; the inside is unchanged. No segmentation or transparency is
   applied. For classifier input, each crop is converted BGR to RGB, centered on
   a black square to preserve proportions, resized to 224 × 224, and
   ImageNet-normalized using the validation transform in `training/effnettrainv2.py`.

Every valid crop is classified once in bounded batches of 16, including when
boxes overlap. Crops are extracted before annotations are drawn. No valid box
means No Detection and null condition confidence, with no EfficientNet call.
The separate annotated overview remains available for compatibility/debugging.

The prediction API returns `image_versions.original` (JPEG data URL) and
`image_versions.yolo_crops` (region ID, original-image bbox, dimensions, JPEG data
URL). The `detections` list contains compact crop metadata and its classification;
image bytes remain outside saved Firestore documents. The farmer-facing result
shows the original photo. The crop data remains available in the prediction API.

`test_pipe.py` exports the original, numbered crop JPEGs, the annotated overview,
and `result.json`. Its default creates a fresh directory per run; an explicit
`--versions-dir` must be empty to avoid mixing crops from different runs.

## Classifier and version

The replacement matches the four-class EfficientNet-B0 architecture and nested
head. The user confirmed that v2 uses the same training script and class order:

| Index | Training label | Condition |
| --- | --- | --- |
| 0 | `No_Disease` | No Disease |
| 1 | `fruit_fasciation` | Fruit Fasciation Disorder |
| 2 | `fruit_rot` | Fruit Rot Disease |
| 3 | `mutli_crown` | Multiple Crown Disorder |

The raw spelling stays in `classifier_class_name`. Startup validates the hash,
finite tensors and class order, and loads the full state strictly. Evaluation
mode and the nested dropout/linear head remain. The supplied v2 script pads
rectangular crops to square before resizing and selects checkpoints by validation
macro F1.
`efficientnet_metrics.json` supplies class indices from the previous training;
its reported accuracy does not evaluate this replacement checkpoint.

Profile: `yolov8m-efficientnet-b0-regions`.
Version: `yolov8m-f53a9470b13c-effnetb0-03af1ac8bba3-roi-v3`.
Detector and classifier scores are separate. The summary prioritizes a predicted
disease/disorder, then the highest classifier confidence. Historical versions
remain unchanged and recommendation normalization supports both ROI v1 and v2.

## Validation boundary

The `assets/plates/preview-photo.webp` integration fixture yields one region
with the new pair at the default thresholds. Field accuracy has not been measured.
In the earlier run at detector threshold 0.15, a black 128 × 96 diagnostic image
produced a false box (36.7% detector confidence), followed by a low-confidence
No Disease classification (26.8%). This is recorded in
`output/backend-crops-2026-11-04/diagnostics.json`; it is not hidden by changing
the threshold. A held-out detection/classification evaluation is still needed.
The replacement is deployed to the existing free CPU Space and verified through
the production Vercel proxy. An authenticated fixture returned one region and
both image versions. This verifies integration, not classification accuracy.

For the previous detector at the 0.65 threshold, the follow-up black-image check
produced zero boxes and the previous pineapple fixture yielded one box. See
`threshold-065/results.json` under the same output directory.
