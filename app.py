import os
import base64
import json
import math
import tempfile
import threading

os.environ.setdefault("YOLO_CONFIG_DIR", os.path.join(tempfile.gettempdir(), "ultralytics"))

import cv2
import numpy as np
import torch
from PIL import Image
from flask import Flask, request, jsonify
import firebase_admin
from firebase_admin import auth, credentials
from scanner_auth import InvalidScannerToken, ScannerAuthUnavailable, verify_demo_token

from scanner_models import (
    CLASSIFIER_ARTIFACT, CLASSIFIER_CONDITIONS, DETECTOR_ARTIFACT, DETECTOR_SHA256, classifier_transform, file_sha256,
    load_classifier, load_classifier_labels, load_detector,
)

# The previous classifier and original detector have been removed.
# Use only the supplied replacement weights and their confirmed class mapping.
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SCANNER_PROFILE = "yolov8m-efficientnet-b0-regions"
YOLO_MODEL_PATH = os.getenv("YOLO_MODEL_PATH", os.path.join(BASE_DIR, "models", DETECTOR_ARTIFACT))
EFFNET_MODEL_PATH = os.getenv("EFFNET_MODEL_PATH", os.path.join(BASE_DIR, "models", CLASSIFIER_ARTIFACT))
CLASSIFIER_METRICS_PATH = os.path.join(BASE_DIR, "models", "efficientnet_metrics.json")
YOLO_CONF_THRESHOLD = float(os.getenv("YOLO_CONF_THRESHOLD", "0.50"))
EFFNET_CONF_THRESHOLD = float(os.getenv("EFFNET_CONF_THRESHOLD", "0.35"))
if not math.isfinite(EFFNET_CONF_THRESHOLD) or not 0 <= EFFNET_CONF_THRESHOLD <= 1:
    raise ValueError("EFFNET_CONF_THRESHOLD must be between 0 and 1")
ANNOTATION_JPEG_QUALITY = int(os.getenv("ANNOTATION_JPEG_QUALITY", "82"))
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "15"))
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "")
FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "").strip()
FIREBASE_AUTH_MODE = os.getenv("FIREBASE_AUTH_MODE", "admin").strip()
FIREBASE_WEB_API_KEY = os.getenv("FIREBASE_WEB_API_KEY", "").strip()
if FIREBASE_AUTH_MODE not in ("admin", "rest"):
    raise ValueError("FIREBASE_AUTH_MODE must be admin or rest")
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_MB * 1024 * 1024
_firebase_app = None
_firebase_app_lock = threading.Lock()


def get_firebase_app():
    """Initialize the Admin SDK once using a secret or application credentials."""
    global _firebase_app
    if _firebase_app is None:
        with _firebase_app_lock:
            if _firebase_app is None:
                if not FIREBASE_PROJECT_ID:
                    raise RuntimeError("FIREBASE_PROJECT_ID must be configured")
                options = {"projectId": FIREBASE_PROJECT_ID}
                service_account_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
                if service_account_json is not None:
                    service_account = json.loads(service_account_json)
                    if (
                        not isinstance(service_account, dict)
                        or service_account.get("project_id") != FIREBASE_PROJECT_ID
                    ):
                        raise ValueError("Firebase credential project does not match FIREBASE_PROJECT_ID")
                    _firebase_app = firebase_admin.initialize_app(
                        credential=credentials.Certificate(service_account),
                        options=options
                    )
                else:
                    _firebase_app = firebase_admin.initialize_app(options=options)
    return _firebase_app


def require_firebase_user():
    """Return the decoded ID token or a Flask response for an auth failure."""
    parts = request.headers.get("Authorization", "").split()
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1]:
        return None, (jsonify({
            "success": False,
            "error": "Sign in to scan an image."
        }), 401)

    if FIREBASE_AUTH_MODE == "rest":
        try:
            return verify_demo_token(parts[1], FIREBASE_PROJECT_ID, FIREBASE_WEB_API_KEY), None
        except InvalidScannerToken:
            return None, (jsonify({"success": False, "error": "Your session has expired or is invalid. Please sign in again."}), 401)
        except ScannerAuthUnavailable:
            return None, (jsonify({"success": False, "error": "Authentication service is unavailable. Please try again later."}), 503)

    try:
        firebase_app = get_firebase_app()
    except Exception as error:
        app.logger.error("Firebase Admin initialization failed: %s", type(error).__name__)
        return None, (jsonify({
            "success": False,
            "error": "Authentication service is unavailable. Please try again later."
        }), 503)

    try:
        decoded = auth.verify_id_token(parts[1], app=firebase_app, check_revoked=True)
    except (auth.InvalidIdTokenError, auth.ExpiredIdTokenError,
            auth.RevokedIdTokenError, auth.UserDisabledError,
            auth.UserNotFoundError, ValueError):
        return None, (jsonify({
            "success": False,
            "error": "Your session has expired or is invalid. Please sign in again."
        }), 401)
    except Exception as error:
        app.logger.error("Firebase ID token verification unavailable: %s", type(error).__name__)
        return None, (jsonify({
            "success": False,
            "error": "Authentication service is unavailable. Please try again later."
        }), 503)

    return decoded, None


@app.after_request
def add_cors_headers(response):
    if FRONTEND_ORIGIN:
        response.headers["Access-Control-Allow-Origin"] = FRONTEND_ORIGIN
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"

    return response


# Both checkpoints and the reviewed output mapping are required at startup.
if not os.path.isfile(YOLO_MODEL_PATH):
    raise FileNotFoundError(f"YOLO model not found: {YOLO_MODEL_PATH}")
print(f"Loading {DETECTOR_ARTIFACT} YOLOv8m detector and EfficientNet-B0 crop classifier.")
yolo_model = load_detector(YOLO_MODEL_PATH)
classifier_labels = load_classifier_labels(CLASSIFIER_METRICS_PATH)
effnet_model = load_classifier(EFFNET_MODEL_PATH).to(device)
effnet_transform = classifier_transform()
MODEL_VERSION = f"yolov8m-{file_sha256(YOLO_MODEL_PATH)[:12]}-effnetb0-{file_sha256(EFFNET_MODEL_PATH)[:12]}-roi-v3"
print(f"Scanner ready on {device}: {MODEL_VERSION}")


def encode_image_to_base64(img):
    success, buffer = cv2.imencode(
        ".jpg",
        img,
        [int(cv2.IMWRITE_JPEG_QUALITY), ANNOTATION_JPEG_QUALITY]
    )

    if not success:
        raise ValueError("Failed to encode output image.")

    image_base64 = base64.b64encode(buffer).decode("utf-8")
    return f"data:image/jpeg;base64,{image_base64}"


def decode_uploaded_image(file_bytes):
    np_arr = np.frombuffer(file_bytes, np.uint8)
    img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

    if img is None:
        raise ValueError("Image could not be loaded. Please upload a valid JPG or PNG image.")

    return img


def draw_label(img, label, x1, y1, image_width, image_height, color):
    font = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = 0.7
    thickness = 2

    text_y = y1 - 10 if y1 > 30 else y1 + 30

    (text_width, text_height), _ = cv2.getTextSize(
        label,
        font,
        font_scale,
        thickness
    )

    bg_x1 = x1
    bg_y1 = max(0, text_y - text_height - 8)
    bg_x2 = min(image_width, x1 + text_width + 10)
    bg_y2 = min(image_height, text_y + 8)

    cv2.rectangle(
        img,
        (bg_x1, bg_y1),
        (bg_x2, bg_y2),
        (0, 0, 0),
        -1
    )

    cv2.putText(
        img,
        label,
        (x1 + 5, text_y),
        font,
        font_scale,
        color,
        thickness
    )


def run_pipeline(file_bytes):
    original = decode_uploaded_image(file_bytes)
    image_height, image_width = original.shape[:2]
    # Let Ultralytics apply its standard letterboxing and normalization to the
    # full original photo. Classifier crops come from this unannotated image.
    results = yolo_model(
        original.copy(), imgsz=640, conf=YOLO_CONF_THRESHOLD, device=str(device), verbose=False
    )[0]
    detections = []
    for box in results.boxes:
        confidence = float(box.conf[0].item())
        if not math.isfinite(confidence) or not YOLO_CONF_THRESHOLD <= confidence <= 1:
            continue
        coordinates = box.xyxy[0].tolist()
        if len(coordinates) != 4 or not all(math.isfinite(value) for value in coordinates):
            continue
        x1, y1 = (math.floor(value) for value in coordinates[:2])
        x2, y2 = (math.ceil(value) for value in coordinates[2:])
        x1, x2 = max(0, min(x1, image_width)), max(0, min(x2, image_width))
        y1, y2 = max(0, min(y1, image_height)), max(0, min(y2, image_height))
        if x2 <= x1 or y2 <= y1:
            continue
        class_id = int(box.cls[0].item())
        detector_label = results.names[class_id]
        detections.append({
            "region_id": len(detections) + 1,
            "detector_class_id": class_id,
            "detector_class_name": detector_label,
            "yolo_confidence": confidence,
            "yolo_confidence_percent": round(confidence * 100, 1),
            "bbox": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
            "crop_width": x2 - x1,
            "crop_height": y2 - y1,
            "classification_input": "yolo-bounding-box-crop"
        })

    # Resize each selected RGB crop using the training script's validation
    # transform. Bounded batches keep memory independent of the number of boxes.
    crop_images = []
    with torch.inference_mode():
        for start in range(0, len(detections), 16):
            batch = detections[start:start + 16]
            tensors = []
            for detection in batch:
                box = detection["bbox"]
                # No padding, segmentation, or whole-photo fallback: everything
                # outside this selected box is discarded, its interior unchanged.
                crop = original[box["y1"]:box["y2"], box["x1"]:box["x2"]]
                crop_images.append({
                    "region_id": detection["region_id"],
                    "bbox": dict(box),
                    "width": detection["crop_width"],
                    "height": detection["crop_height"],
                    "image": encode_image_to_base64(crop)
                })
                rgb = Image.fromarray(cv2.cvtColor(crop, cv2.COLOR_BGR2RGB))
                tensors.append(effnet_transform(rgb))
            logits = effnet_model(torch.stack(tensors).to(device))
            if logits.shape != (len(batch), len(classifier_labels)) or not torch.isfinite(logits).all():
                raise ValueError("Classifier returned invalid output scores.")
            probabilities = torch.softmax(logits, dim=1).cpu()
            for detection, scores in zip(batch, probabilities):
                index = int(scores.argmax().item())
                confidence = float(scores[index].item())
                # Compare in the score tensor's precision so an exact 35%
                # float32 score is accepted at a configured threshold of 0.35.
                accepted = bool((scores[index] >= EFFNET_CONF_THRESHOLD).item())
                condition = CLASSIFIER_CONDITIONS[index] if accepted else "Uncertain"
                detection.update({
                    "class_name": condition.replace(" ", "_"),
                    "pretty_class_name": condition,
                    "classifier_class_index": index if accepted else None,
                    "classifier_class_name": classifier_labels[index] if accepted else None,
                    "efficientnet_confidence": confidence,
                    "efficientnet_confidence_percent": round(confidence * 100, 1),
                    "classification_available": True,
                    "classification_accepted": accepted,
                    "classifier_confidence_threshold": EFFNET_CONF_THRESHOLD,
                })

    # Draw only after every crop has been classified so overlay pixels never
    # enter the classifier, including when candidate regions overlap.
    img = original.copy()
    for number, detection in enumerate(detections, start=1):
        x1, y1, x2, y2 = (detection["bbox"][key] for key in ("x1", "y1", "x2", "y2"))
        color = (82, 196, 243)
        cv2.rectangle(img, (x1, y1), (x2, y2), color, 3)
        draw_label(
            img, f"Region {number} | {detection['pretty_class_name']}: {detection['efficientnet_confidence_percent']:.1f}%",
            x1, y1, image_width, image_height, color
        )

    # Surface a predicted disease/disorder before a No Disease region. Among
    # those regions, use the highest classifier confidence for the summary.
    classified = [item for item in detections if item["classification_accepted"]]
    uncertain = [item for item in detections if not item["classification_accepted"]]
    concerns = [item for item in classified if item["classifier_class_index"] != 0]
    # An unclassified crop must not allow a different No Disease crop to turn
    # the whole photo green. Accepted concerns still take priority.
    top = max(concerns or uncertain or classified, key=lambda item: item["efficientnet_confidence"], default=None)
    status_type = {0: "healthy", 1: "monitor", 2: "risk", 3: "monitor"}.get(
        top["classifier_class_index"] if top else None, "monitor"
    )
    return {
        "success": True,
        "model_version": MODEL_VERSION,
        "scanner_profile": SCANNER_PROFILE,
        "inference_mode": "region-classification",
        "classification_available": True,
        "classification_scope": "yolo-regions",
        "classifier_input": "yolo-bounding-box-crops",
        "classifier_confidence_threshold": EFFNET_CONF_THRESHOLD,
        "yolo_confidence_threshold": YOLO_CONF_THRESHOLD,
        "classified_region_count": len(classified),
        "image_versions": {
            "original": encode_image_to_base64(original),
            "yolo_crops": crop_images
        },
        "experimental": True,
        "device": str(device),
        "image_width": image_width,
        "image_height": image_height,
        "detection_count": len(detections),
        "detections": detections,
        "detector_top_confidence": max((item["yolo_confidence_percent"] for item in detections), default=0),
        "top_class": top["pretty_class_name"] if top else "No Detection",
        "top_confidence": top["efficientnet_confidence_percent"] if top else None,
        "status_label": {"healthy": "Healthy", "risk": "Risk", "monitor": "Monitor"}[status_type],
        "status_type": status_type,
        "message": (
            "Some detected crops are below the classification threshold and are marked Uncertain. Review the regions or take another clear photo."
            if uncertain else
            "YOLO selected candidate regions and EfficientNet classified each crop. Review the numbered regions below."
            if detections else
            "YOLO found no candidate regions, so EfficientNet did not classify this photo. No Detection does not mean No Disease."
        ),
        "recommendation": "Inspect the photographed sample and compare the region predictions with what you see in person. The summary prioritizes a predicted disease or disorder when regions differ.",
        "preprocessing_steps": [{
            "order": 1, "name": "YOLO Input Preparation",
            "used_for": "The full photo uses standard YOLO resizing, letterboxing, and normalization."
        }, {
            "order": 2, "name": "EfficientNet Crop Preparation",
            "used_for": "Each unannotated YOLO region is converted to RGB, resized to 224 × 224, and normalized using the training settings."
        }],
        "preprocessing_summary": {
            "scanner_profile": SCANNER_PROFILE,
            "detector_input": "original",
            "classification_available": True,
            "classifier_input": "unannotated-yolo-crops",
            "crop_background": "outside-bounding-box-removed",
            "original_classified": False,
            "classifier_input_size": [224, 224]
        },
        "annotated_image": encode_image_to_base64(img)
    }


# =========================
# 6. ROUTES
# =========================

@app.route("/")
def index():
    return jsonify({
        "service": "AGRI-VISION prediction API",
        "health": "/api/health",
        "predict": "/api/predict"
    })


@app.route("/health")
@app.route("/api/health")
def health():
    return jsonify({
        "success": True,
        "message": "AGRI-VISION backend is running.",
        "scanner_ready": bool(FIREBASE_PROJECT_ID) and (FIREBASE_AUTH_MODE == "admin" or bool(FIREBASE_WEB_API_KEY)),
        "auth_mode": FIREBASE_AUTH_MODE,
        "model_version": MODEL_VERSION,
        "scanner_profile": SCANNER_PROFILE,
        "experimental": True,
        "detector_ready": True,
        "classification_ready": True,
        "inference_mode": "region-classification",
        "active_detector": "YOLOv8m",
        "detector_artifact": os.path.basename(YOLO_MODEL_PATH),
        "detector_sha256": DETECTOR_SHA256,
        "detector_classes": yolo_model.names,
        "active_classifier": "EfficientNet-B0",
        "classification_scope": "yolo-regions",
        "classifier_input": "yolo-bounding-box-crops",
        "image_versions": ["original", "yolo_crops"],
        "classifier_classes": list(CLASSIFIER_CONDITIONS),
        "classifier_confidence_threshold": EFFNET_CONF_THRESHOLD,
        "yolo_confidence_threshold": YOLO_CONF_THRESHOLD,
        "device": str(device)
    })


@app.route("/predict", methods=["POST", "OPTIONS"])
@app.route("/api/predict", methods=["POST", "OPTIONS"])
def predict():
    if request.method == "OPTIONS":
        return ("", 204)

    _, auth_error = require_firebase_user()
    if auth_error is not None:
        return auth_error

    try:
        if "image" not in request.files:
            return jsonify({
                "success": False,
                "error": "No image file uploaded."
            }), 400

        image_file = request.files["image"]

        if image_file.filename == "":
            return jsonify({
                "success": False,
                "error": "Empty image filename."
            }), 400

        file_bytes = image_file.read()

        if not file_bytes:
            return jsonify({
                "success": False,
                "error": "Image file is empty."
            }), 400

        result = run_pipeline(file_bytes)
        return jsonify(result)

    except Exception as error:
        print("Prediction error:", error)

        return jsonify({
            "success": False,
            "error": str(error)
        }), 500


if __name__ == "__main__":
    app.run(
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", "5000")),
        debug=os.getenv("FLASK_DEBUG", "true").lower() == "true",
        use_reloader=False
    )
