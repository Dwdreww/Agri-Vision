import os
import base64
import cv2
import numpy as np
import torch
import torch.nn as nn

from flask import Flask, request, jsonify, send_from_directory
from torchvision import transforms, models
from ultralytics import YOLO
from PIL import Image


# =========================
# 1. CONFIGURATION
# =========================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

YOLO_MODEL_PATH = os.path.join(BASE_DIR, "yolov8.pt")
EFFNET_MODEL_PATH = os.path.join(BASE_DIR, "efficientnetB0.pth")

YOLO_CONF_THRESHOLD = 0.15

allowed_origins_raw = os.environ.get("AGRI_VISION_ALLOWED_ORIGINS", "*")
ALLOWED_ORIGINS = [
    origin.strip().rstrip("/")
    for origin in allowed_origins_raw.split(",")
    if origin.strip()
]

CLASS_NAMES = [
    "Crown_Rot_Disease",
    "Fruit_Fasciation_Disorder",
    "Fruit_Rot_Disease",
    "Mealybug_Wilt_Disease",
    "Multiple_Crown_Disorder",
    "No_Disease",
    "Root_Rot_Disease"
]

NUM_CLASSES = len(CLASS_NAMES)

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")


# =========================
# 2. FLASK APP
# =========================

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 15 * 1024 * 1024


@app.after_request
def add_cors_headers(response):
    origin = request.headers.get("Origin")

    if origin:
        normalized_origin = origin.rstrip("/")

        if "*" in ALLOWED_ORIGINS or normalized_origin in ALLOWED_ORIGINS:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Vary"] = "Origin"

    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Max-Age"] = "86400"

    return response


# =========================
# 3. LOAD MODELS ONCE
# =========================

print("======================================")
print("AGRI-VISION BACKEND STARTING")
print("======================================")
print(f"Using device: {device}")

if not os.path.exists(YOLO_MODEL_PATH):
    raise FileNotFoundError(f"YOLO model not found:\n{YOLO_MODEL_PATH}")

if not os.path.exists(EFFNET_MODEL_PATH):
    raise FileNotFoundError(f"EfficientNet model not found:\n{EFFNET_MODEL_PATH}")

print("Loading YOLO model...")
yolo_model = YOLO(YOLO_MODEL_PATH)
print("YOLO model loaded.")

print("Loading EfficientNet model...")
effnet_model = models.efficientnet_b0(weights=None)

in_features = effnet_model.classifier[1].in_features
effnet_model.classifier[1] = nn.Linear(in_features, NUM_CLASSES)

try:
    state_dict = torch.load(
        EFFNET_MODEL_PATH,
        map_location=device,
        weights_only=True
    )
except TypeError:
    state_dict = torch.load(
        EFFNET_MODEL_PATH,
        map_location=device
    )

effnet_model.load_state_dict(state_dict)
effnet_model = effnet_model.to(device)
effnet_model.eval()

print("EfficientNet model loaded.")
print("Backend ready.")


# =========================
# 4. IMAGE TRANSFORM
# =========================

effnet_transforms = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(
        [0.485, 0.456, 0.406],
        [0.229, 0.224, 0.225]
    )
])


# =========================
# 5. HELPER FUNCTIONS
# =========================

def pretty_class_name(name):
    return name.replace("_", " ")


def encode_image_to_base64(img):
    success, buffer = cv2.imencode(".jpg", img)

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


def get_status_from_detections(detections):
    if len(detections) == 0:
        return {
            "status_label": "Monitor",
            "status_type": "monitor",
            "message": "No YOLO detections passed the confidence threshold.",
            "recommendation": "Try a clearer image, better lighting, or lower YOLO_CONF_THRESHOLD for testing.",
            "top_class": "No Detection",
            "top_confidence": 0
        }

    disease_detections = [
        detection for detection in detections
        if detection["class_name"] != "No_Disease"
    ]

    if disease_detections:
        top_detection = max(
            disease_detections,
            key=lambda item: item["efficientnet_confidence"]
        )

        return {
            "status_label": "Risk",
            "status_type": "risk",
            "message": f"Possible issue detected: {pretty_class_name(top_detection['class_name'])}.",
            "recommendation": "Inspect the crop manually, compare symptoms, and retake the image under better lighting if needed.",
            "top_class": pretty_class_name(top_detection["class_name"]),
            "top_confidence": round(top_detection["efficientnet_confidence"] * 100, 1)
        }

    top_detection = max(
        detections,
        key=lambda item: item["efficientnet_confidence"]
    )

    return {
        "status_label": "Healthy",
        "status_type": "healthy",
        "message": "Detected region was classified as No Disease.",
        "recommendation": "Continue regular crop monitoring and keep current care practices.",
        "top_class": pretty_class_name(top_detection["class_name"]),
        "top_confidence": round(top_detection["efficientnet_confidence"] * 100, 1)
    }


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
    img = decode_uploaded_image(file_bytes)
    image_height, image_width = img.shape[:2]

    results = yolo_model(img, verbose=False)[0]

    detections = []

    for box in results.boxes:
        yolo_confidence = box.conf[0].item()

        if yolo_confidence < YOLO_CONF_THRESHOLD:
            continue

        x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())

        x1 = max(0, min(x1, image_width - 1))
        y1 = max(0, min(y1, image_height - 1))
        x2 = max(0, min(x2, image_width))
        y2 = max(0, min(y2, image_height))

        if x2 <= x1 or y2 <= y1:
            continue

        crop = img[y1:y2, x1:x2]

        if crop.size == 0:
            continue

        crop_rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
        crop_pil = Image.fromarray(crop_rgb)
        input_tensor = effnet_transforms(crop_pil).unsqueeze(0).to(device)

        with torch.no_grad():
            outputs = effnet_model(input_tensor)
            probabilities = torch.nn.functional.softmax(outputs, dim=1)[0]
            confidence, predicted_idx = torch.max(probabilities, 0)

        final_class = CLASS_NAMES[predicted_idx.item()]
        effnet_confidence = confidence.item()

        detection_data = {
            "class_name": final_class,
            "pretty_class_name": pretty_class_name(final_class),
            "efficientnet_confidence": effnet_confidence,
            "efficientnet_confidence_percent": round(effnet_confidence * 100, 1),
            "yolo_confidence": yolo_confidence,
            "yolo_confidence_percent": round(yolo_confidence * 100, 1),
            "bbox": {
                "x1": x1,
                "y1": y1,
                "x2": x2,
                "y2": y2
            }
        }

        detections.append(detection_data)

        if final_class == "No_Disease":
            color = (0, 255, 0)
        else:
            color = (0, 180, 255)

        label = f"{pretty_class_name(final_class)}: {effnet_confidence * 100:.1f}%"

        cv2.rectangle(
            img,
            (x1, y1),
            (x2, y2),
            color,
            4
        )

        draw_label(
            img=img,
            label=label,
            x1=x1,
            y1=y1,
            image_width=image_width,
            image_height=image_height,
            color=color
        )

    summary = get_status_from_detections(detections)
    annotated_image = encode_image_to_base64(img)

    return {
        "success": True,
        "device": str(device),
        "image_width": image_width,
        "image_height": image_height,
        "detection_count": len(detections),
        "detections": detections,
        "annotated_image": annotated_image,
        **summary
    }


# =========================
# 6. ROUTES
# =========================

@app.route("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/style.css")
def css():
    return send_from_directory(BASE_DIR, "style.css")


@app.route("/app.js")
def javascript():
    return send_from_directory(BASE_DIR, "app.js")


@app.route("/config.js")
def frontend_config():
    return send_from_directory(BASE_DIR, "config.js")


@app.route("/health")
def health():
    return jsonify({
        "success": True,
        "message": "AGRI-VISION backend is running.",
        "device": str(device)
    })


@app.route("/predict", methods=["POST"])
def predict():
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
    port = int(os.environ.get("PORT", "5000"))
    host = os.environ.get("HOST", "0.0.0.0")
    debug = os.environ.get("FLASK_DEBUG", "").lower() in ("1", "true", "yes")

    app.run(
        host=host,
        port=port,
        debug=debug,
        use_reloader=False
    )
