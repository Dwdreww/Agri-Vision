import os
import cv2
import torch
import torch.nn as nn
from torchvision import transforms, models
from ultralytics import YOLO
from PIL import Image

from preprocessing import preprocess_pineapple_image

# --- 1. Configuration ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

YOLO_MODEL_PATH = os.getenv("YOLO_MODEL_PATH", os.path.join(BASE_DIR, "yolov8.pt"))
EFFNET_MODEL_PATH = os.getenv("EFFNET_MODEL_PATH", os.path.join(BASE_DIR, "efficientnetB0.pth"))
TEST_IMAGE_PATH = os.getenv("TEST_IMAGE_PATH", os.path.join(BASE_DIR, "pineappletest.png"))

OUTPUT_DIR = os.getenv("OUTPUT_DIR", os.path.join(BASE_DIR, "outputs"))
OUTPUT_IMAGE_PATH = os.path.join(OUTPUT_DIR, "pipeline_result.jpg")
PREPROCESSED_IMAGE_PATH = os.path.join(OUTPUT_DIR, "01_preprocessed_model_input.jpg")
GRAYSCALE_IMAGE_PATH = os.path.join(OUTPUT_DIR, "02_grayscale_conversion.jpg")
NOISE_REDUCED_IMAGE_PATH = os.path.join(OUTPUT_DIR, "03_gaussian_noise_reduction.jpg")
SEGMENTATION_MASK_PATH = os.path.join(OUTPUT_DIR, "04_final_segmentation_mask.jpg")
GRABCUT_MASK_PATH = os.path.join(OUTPUT_DIR, "05_grabcut_foreground_mask.jpg")
DARK_SPOT_MASK_PATH = os.path.join(OUTPUT_DIR, "06_dark_spot_candidate_mask.jpg")
SHOW_WINDOW = os.getenv("SHOW_WINDOW", "true").lower() == "true"

YOLO_CONF_THRESHOLD = 0.5

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

# Use CPU if CUDA/GPU is not available
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

print("======================================")
print("AGRI-VISION TWO-STAGE PIPELINE")
print("======================================")
print(f"Using device: {device}")

# --- 2. Check Files ---
if not os.path.exists(YOLO_MODEL_PATH):
    raise FileNotFoundError(f"YOLO model not found:\n{YOLO_MODEL_PATH}")

if not os.path.exists(EFFNET_MODEL_PATH):
    raise FileNotFoundError(f"EfficientNet model not found:\n{EFFNET_MODEL_PATH}")

if not os.path.exists(TEST_IMAGE_PATH):
    raise FileNotFoundError(f"Test image not found:\n{TEST_IMAGE_PATH}")

os.makedirs(OUTPUT_DIR, exist_ok=True)

print("All files found successfully.")

# --- 3. Load YOLO Model ---
print("\nLoading YOLO model...")
yolo_model = YOLO(YOLO_MODEL_PATH)
print("YOLO model loaded.")

# --- 4. Load EfficientNet Model ---
print("\nLoading EfficientNet model...")

effnet_model = models.efficientnet_b0(weights=None)

in_features = effnet_model.classifier[1].in_features
effnet_model.classifier[1] = nn.Linear(in_features, NUM_CLASSES)

# Important fix: allows Colab/GPU-trained model to load on CPU laptop/PC
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

# --- 5. EfficientNet Transform ---
effnet_transforms = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(
        [0.485, 0.456, 0.406],
        [0.229, 0.224, 0.225]
    )
])

# --- 6. Load Image ---
print("\nLoading test image...")
img = cv2.imread(TEST_IMAGE_PATH)

if img is None:
    raise ValueError(
        "Image could not be loaded. Check the image path or convert the image to JPG/PNG."
    )

image_height, image_width = img.shape[:2]

print(f"Image loaded successfully: {image_width}x{image_height}")

# --- 7. Explainable Computer Vision Pre-Processing ---
print("\nRunning computer vision pre-processing...")

preprocessed = preprocess_pineapple_image(img)

# PRE-PROCESSING OUTPUT USED BY YOLO:
# This image has contrast enhancement, foreground segmentation, and background
# softening while keeping the same image size for correct bounding boxes.
yolo_input = preprocessed["model_input"]

# PRE-PROCESSING OUTPUT USED BY EFFICIENTNET:
# The crop is taken from a contrast-enhanced version so disease textures and
# discoloration are easier for the classifier to read.
classification_source = preprocessed["contrast_enhanced"]

# Keep a clean copy of the original image for drawing final results.
annotated_img = img.copy()

cv2.imwrite(PREPROCESSED_IMAGE_PATH, yolo_input)
cv2.imwrite(GRAYSCALE_IMAGE_PATH, preprocessed["grayscale"])
cv2.imwrite(NOISE_REDUCED_IMAGE_PATH, preprocessed["noise_reduced_gray"])
cv2.imwrite(SEGMENTATION_MASK_PATH, preprocessed["segmentation_mask"])
cv2.imwrite(GRABCUT_MASK_PATH, preprocessed["grabcut_mask"])
cv2.imwrite(DARK_SPOT_MASK_PATH, preprocessed["dark_spot_candidate_mask"])

print("Pre-processing stages used:")
for step in preprocessed["steps"]:
    print(f"{step['order']}. {step['name']} - {step['used_for']}")

print(f"Segmentation mask coverage: {preprocessed['mask_coverage_percent']}%")
print(f"Dark spot candidate coverage: {preprocessed['dark_spot_coverage_percent']}%")
print(f"Pre-processing outputs saved to: {OUTPUT_DIR}")

# --- 8. Run YOLO Detection ---
print("\nRunning YOLO detection...")
results = yolo_model(yolo_input, verbose=False)[0]

detection_count = 0

# --- 9. Process YOLO Boxes ---
for box in results.boxes:
    conf = box.conf[0].item()

    if conf < YOLO_CONF_THRESHOLD:
        continue

    detection_count += 1

    print("\n--- NEW DETECTION ---")
    print(f"YOLO spotted an anomaly. Confidence: {conf * 100:.1f}%")

    x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())

    # Keep coordinates inside image boundaries
    x1 = max(0, min(x1, image_width - 1))
    y1 = max(0, min(y1, image_height - 1))
    x2 = max(0, min(x2, image_width))
    y2 = max(0, min(y2, image_height))

    if x2 <= x1 or y2 <= y1:
        print("Invalid bounding box. Skipping.")
        continue

    # --- 10. Crop Detection ---
    crop = classification_source[y1:y2, x1:x2]

    if crop.size == 0:
        print("ERROR: Crop size is 0, skipping EfficientNet.")
        continue

    print(f"Crop shape extracted: {crop.shape}")

    # --- 11. Prepare Crop for EfficientNet ---
    crop_rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
    crop_pil = Image.fromarray(crop_rgb)

    input_tensor = effnet_transforms(crop_pil).unsqueeze(0).to(device)

    # --- 12. EfficientNet Classification ---
    with torch.no_grad():
        outputs = effnet_model(input_tensor)
        probabilities = torch.nn.functional.softmax(outputs, dim=1)[0]

        confidence, predicted_idx = torch.max(probabilities, 0)

        final_class = CLASS_NAMES[predicted_idx.item()]
        effnet_conf_score = confidence.item()

    print(f"EfficientNet classified it as: {final_class}")
    print(f"EfficientNet confidence: {effnet_conf_score * 100:.1f}%")

    # --- 13. Draw Result ---
    label = f"{final_class}: {effnet_conf_score * 100:.1f}%"

    cv2.rectangle(annotated_img, (x1, y1), (x2, y2), (0, 255, 0), 4)

    text_y = y1 - 10 if y1 > 30 else y1 + 30

    font = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = 0.7
    thickness = 2

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
        annotated_img,
        (bg_x1, bg_y1),
        (bg_x2, bg_y2),
        (0, 0, 0),
        -1
    )

    cv2.putText(
        annotated_img,
        label,
        (x1 + 5, text_y),
        font,
        font_scale,
        (0, 255, 0),
        thickness
    )

# --- 14. Final Output ---
if detection_count == 0:
    print("\nNo YOLO detections passed the confidence threshold.")
    print("Try lowering YOLO_CONF_THRESHOLD to 0.05 for testing.")

cv2.imwrite(OUTPUT_IMAGE_PATH, annotated_img)

print("\n======================================")
print("Pipeline finished.")
print(f"Total detections: {detection_count}")
print(f"Result saved to: {OUTPUT_IMAGE_PATH}")
print("======================================")

if SHOW_WINDOW:
    cv2.imshow("AGRI-VISION Two-Stage Pipeline", annotated_img)
    cv2.waitKey(0)
    cv2.destroyAllWindows()
else:
    print("OpenCV display skipped because SHOW_WINDOW=false.")
