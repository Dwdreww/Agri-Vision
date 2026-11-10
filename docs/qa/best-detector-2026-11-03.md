# Detector replacement — November 3, 2026

The user requested replacing the active detector with the supplied `best.pt`.
The file is installed at `models/best.pt`; its SHA-256 is
`273092bf7850ed863cfe31d32c380326e852b162bfc3f347dee2c760f641018c`.
It strictly matches YOLOv8m with one output class, `item`. The previous 80-class
checkpoint was initially archived at `models/archive/yolov8m-coco.pt`, then
deleted at the user's request. `best.pt` is now the only YOLO checkpoint in the
project, and Docker copies only the active detector and classifier artifacts.

The loader verifies the artifact checksum, uses restricted PyTorch loading and
copies state strictly into the installed one-class YOLOv8m architecture. It does
not build a model from checkpoint YAML. The health endpoint identifies
`best.pt`, its checksum and class mapping, and confirms EfficientNet-B0 ready.
The version is `yolov8m-273092bf7850-effnetb0-43adddf64b22-roi-v1`.

Seventeen Python model/backend tests pass, covering active artifact identity,
checksum rejection, absence of old checkpoints, both models, classifier mappings,
unannotated RGB crops, no-region behavior, invalid scores and authentication.
Eleven live checks pass through the Vite proxy: authenticated inference with the
new `item` detector, saving classifier and detector metadata, private photos,
recommendation access, sharing/revocation and record/account cleanup. Disposable
accounts and records were removed. Actual new pipeline output also passed the
EffNet recommendation mapper with the detector label excluded from AI inputs.

The `pineappletest.png` fixture produces one `item` region at 71.2% detector
confidence; EfficientNet predicts Fruit Rot Disease at 47.7% classifier
confidence. The crown-only visual fixture produces no region and no classifier
call, retaining No Detection with null condition confidence. The positive test
fixture was changed from the crown-only image to the pineapple photo accordingly.
Example response and annotated image: `output/best-detector-2026-11-03/`.

These are functional checks, not an evaluation against labeled held-out images.
The precise annotation meaning of the training label `item` has not been
provided. Its name is preserved in metadata and remains hidden in the interface.
Public deployment and a Docker image build were not performed.
