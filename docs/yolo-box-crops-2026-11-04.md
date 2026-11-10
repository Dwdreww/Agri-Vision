# bestv3 and crop image versions — 4 November 2026

## User request and interpretation

The user supplied `/Users/andrewvlnz/Downloads/bestv3.pt` and requested replacement
of the active YOLO, separate original and cropped versions, and classification
only of the YOLO-selected image. They clarified that only the detected bounding
box should remain. This means a rectangular crop, discarding all pixels outside
the box, with no pixel segmentation, transparent masking, or changes inside it.

## Changes

- Copied the supplied file unchanged to `models/bestv3.pt`. Its SHA-256 is
  `28a5c00ab63b92c052f5e4701cdc0f79f857f59ca6c7f5e81e78e78f41b544c5`.
- Restricted checkpoint loading, finite parameters, strict installed architecture
  loading, and a finite CPU forward were verified. This is YOLOv8m, one `item`
  class, 25,856,899 parameters, and a `[1, 5, 8400]` forward output at 640 px.
- The old `best.pt` remains inactive for local rollback. The loader accepts only
  the new checksum. Docker and the prepared backend release include only bestv3.
- Kept the existing EfficientNet-B0 checkpoint and confirmed four-class mapping.
- The backend already used YOLO crops for classification. This revision makes
  the two versions explicit, preserves the unannotated original separately,
  records crop dimensions/region IDs, and rounds/clips exact crop bounds.
- Every valid box yields one crop. Only that crop goes through RGB conversion,
  224 × 224 resize, normalization, and EfficientNet. Original photos are never
  classified directly or substituted when YOLO finds no valid box. Batches are
  bounded to 16. Overlays are drawn on a separate copy after crops are processed.
- New model version: `yolov8m-28a5c00ab63b-effnetb0-43adddf64b22-roi-v2`.
  Recommendations still accept the verified ROI v1 and v2 class mapping.

## Prediction contract

The response retains existing fields and adds:

```text
classifier_input: yolo-bounding-box-crops
image_versions.original: JPEG data URL of the unannotated decoded photo
image_versions.yolo_crops[]:
  region_id, bbox, width, height, image (JPEG data URL)
detections[]:
  existing condition/confidence fields
  region_id, crop_width, crop_height
  classification_input: yolo-bounding-box-crop
```

Bounds reference the original photo and use exclusive right/bottom indices.
No detections yields an empty crop array, No Detection, and null condition
confidence. It never implies No Disease. The original and crops are visual JPEG
exports; classifier preprocessing uses the source crop pixels before JPEG export,
not annotations or a recompressed full-photo version. `annotated_image` remains
as a compatible debugging overview.

The UI's existing Original/YOLO toggle now shows the actual selected crop instead
of a full photograph with drawn boxes. A clip path prevents pixels outside the
box appearing in display letterboxing. Saved views use the original/prepared
photo and compact bbox metadata; image data URLs are not added to Firestore.
Historical unclassified results do not claim an EfficientNet classification.
No new cloud storage or historical data migration was introduced.

`test_pipe.py` writes original.jpg, yolo-crop-NNN.jpg, result.json, and the
annotated overview. A fresh default run folder avoids stale crops. Explicit
`--versions-dir` must be empty.

## Verification

- 26 Python tests pass: real detector/classifier inference, exact unannotated RGB
  crop inputs, overlapping boxes, clipped/fractional bounds, batched classification,
  invalid boxes/scores, no-box behavior, model identity, mapping, and auth routes.
- 61 frontend tests and 71 server tests pass. V2 recommendation compatibility has
  an explicit test.
- Production build, Python compilation, server/script syntax checks, and selected
  tracked-file whitespace checks pass. The existing large JS chunk warning remains.
- Real `pineappletest.png` run: one box `[30,84,455,516]`, crop 425 × 432,
  detector confidence 66.2%, predicted Multiple Crown Disorder at 41.5%.
  This verifies integration and does not establish condition accuracy.
- The no-detection CLI run exported only original.jpg and result.json, with no
  crop files and an empty crop manifest.
- Browser check used the actual DetectionViewer with that run's image/metadata.
  Original and crop toggles worked; the SVG viewBox and clip matched the box.
  Desktop preview and 390 px mobile layout rendered without horizontal overflow;
  no browser console errors were captured.
- Prepared 10 allowlisted backend release files (68,405,344 manifested bytes
  plus the generated README) in
  `output/release-2026-11-04/`. The new model hash is in the release manifest.

## Model quality finding and limits

At the unchanged 0.15 detector threshold, a black 128 × 96 image produced one
false box at 36.7% detector confidence. EfficientNet labeled the resulting crop
No Disease at only 26.8%. This is recorded in `diagnostics.json`. The original
blank-negative test assumption was replaced with a deterministic no-box guard;
the real crown fixture still tests a genuine zero-box result with no classifier
call. No threshold was changed to conceal the false positive.

No training or held-out accuracy study was performed. No live Firebase account
mutations, model-service deployment, or paid services were used. Docker itself
was not built. The backend source and release are local; the public Space still
runs its prior version. Local Flask-client tests preserve authentication, but a
live signed-in inference was not performed during this change.

## Evidence and references

Outputs and logs: `output/backend-crops-2026-11-04/`.
The original and crop JPEGs are in its `pineapple/` folder. `result.json` links the
crop to its classifier output. `original-vs-yolo-crop.png` and
`mobile-crop-view.png` show the real inference sample in the viewer. Checkpoint
inspection is at `models/bestv3.inspection.json`.

Implementation references: [Ultralytics result boxes/crops](https://docs.ultralytics.com/reference/engine/results/)
and [PyTorch restricted loading](https://docs.pytorch.org/docs/stable/notes/serialization.html).
The installed package versions and local tests determine actual compatibility.

## Follow-up: requested threshold 0.65

The user subsequently requested changing the YOLO confidence threshold to 0.65.
The backend default is now 0.65, with the existing environment override retained.
The crop fixture that exercises two accepted boxes now uses confidence values
above this threshold; the rejection fixture checks a 0.64 box is excluded.

All 26 Python tests pass. Real inference at 0.65 produces no boxes or classifier
call for the black diagnostic image, while the pineapple fixture retains one box
at 66.2% detector confidence. Evidence is in
`output/backend-crops-2026-11-04/threshold-065/`. The local backend release package
was refreshed. The earlier diagnostic results above used 0.15 and remain as
historical evidence. The public backend has not been redeployed.
