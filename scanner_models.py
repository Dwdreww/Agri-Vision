"""Restricted loading for the reviewed detector and supplied classifier weights."""
import hashlib
import json
from pathlib import Path

import torch
from torchvision import models, transforms
from torchvision.transforms.functional import pad
from ultralytics import YOLO
from ultralytics.nn.modules import Bottleneck, C2f, Concat, Conv, Detect, DFL, SPPF
from ultralytics.nn.tasks import DetectionModel

DETECTOR_ARTIFACT = "bestv4.pt"
DETECTOR_SHA256 = "f53a9470b13c1e41e4821ce0622c38676fe4e4c48c7d63dbc355002631b53826"
DETECTOR_LABELS = {0: "item"}
CLASSIFIER_ARTIFACT = "efficientnet_pineapple_bestv2.pth"
CLASSIFIER_SHA256 = "03af1ac8bba3d0f65f318a5fbf1cb4f57cdbc7374e4d44f2c0708d8ff3fee42d"
CLASSIFIER_OUTPUT_COUNT = 4
CLASSIFIER_LABELS = ("No_Disease", "fruit_fasciation", "fruit_rot", "mutli_crown")
CLASSIFIER_CONDITIONS = (
    "No Disease", "Fruit Fasciation Disorder", "Fruit Rot Disease", "Multiple Crown Disorder",
)


def load_classifier_labels(path):
    """Confirm the original output order from the supplied training metrics."""
    with Path(path).open(encoding="utf-8") as source:
        indices = json.load(source).get("class_indices")
    if not isinstance(indices, dict) or set(indices) != {str(i) for i in range(CLASSIFIER_OUTPUT_COUNT)}:
        raise ValueError("Classifier metadata must name all four output indices.")
    labels = tuple(indices[str(i)] for i in range(CLASSIFIER_OUTPUT_COUNT))
    if labels != CLASSIFIER_LABELS:
        raise ValueError("Classifier class mapping differs from the reviewed training metrics.")
    return labels


def file_sha256(path):
    with Path(path).open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def load_detector(path):
    """Load only the reviewed artifact, then copy its exact weights into local YOLO architecture."""
    if file_sha256(path) != DETECTOR_SHA256:
        raise ValueError("Detector checksum mismatch. Review replacement weights before changing the active detector.")
    allowed = [
        DetectionModel, Conv, C2f, Bottleneck, SPPF, Concat, Detect, DFL,
        torch.nn.Sequential, torch.nn.ModuleList, torch.nn.Conv2d,
        torch.nn.BatchNorm2d, torch.nn.SiLU, torch.nn.MaxPool2d, torch.nn.Upsample,
    ]
    with torch.serialization.safe_globals(allowed):
        checkpoint = torch.load(path, map_location="cpu", weights_only=True)
    source = (checkpoint.get("ema") or checkpoint["model"]).float()
    if source.names != DETECTOR_LABELS or source.model[-1].nc != 1:
        raise ValueError("The reviewed detector must have the single output class 'item'.")
    if any(value.is_floating_point() and not torch.isfinite(value).all()
           for value in source.state_dict().values()):
        raise ValueError("Detector weights contain non-finite values.")
    detector = YOLO("yolov8m.yaml", task="detect")
    # Build the reviewed one-class head using installed architecture code. The
    # checkpoint's serialized YAML/configuration is not used to construct it.
    detector.model = DetectionModel("yolov8m.yaml", nc=1, verbose=False)
    detector.model.load_state_dict(source.state_dict(), strict=True)
    detector.model.names = dict(source.names)
    return detector


def load_classifier(path):
    """Recreate the supplied EfficientNet-B0, without downloading pretrained weights.

    Output labels must be loaded separately from the reviewed training metrics.
    """
    if file_sha256(path) != CLASSIFIER_SHA256:
        raise ValueError("Classifier checksum mismatch. Review replacement weights before loading the classifier.")
    state = torch.load(path, map_location="cpu", weights_only=True)
    if any(value.is_floating_point() and not torch.isfinite(value).all()
           for value in state.values()):
        raise ValueError("Classifier weights contain non-finite values.")
    classifier = models.efficientnet_b0(weights=None)
    in_features = classifier.classifier[1].in_features
    classifier.classifier[1] = torch.nn.Sequential(
        torch.nn.Dropout(p=0.3, inplace=True),
        torch.nn.Linear(in_features, CLASSIFIER_OUTPUT_COUNT),
    )
    classifier.load_state_dict(state, strict=True)
    return classifier.eval()


def square_pad(image):
    """Match effnettrainv2.py: center the crop on a black square."""
    width, height = image.size
    side = max(width, height)
    left = (side - width) // 2
    top = (side - height) // 2
    return pad(image, (left, top, side - width - left, side - height - top),
               fill=0, padding_mode="constant")


def classifier_transform():
    """The supplied script's validation transform; input must be an RGB PIL image."""
    return transforms.Compose([
        square_pad,
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ])
