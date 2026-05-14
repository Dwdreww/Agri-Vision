import os
import cv2
import torch
import torch.nn as nn
from torchvision import transforms, models
from ultralytics import YOLO
from PIL import Image

# --- 1. Configuration ---
YOLO_MODEL_PATH = r"D:\Agri-Vision\yolov8.pt"
EFFNET_MODEL_PATH = r"D:\Agri-Vision\efficientnetB0.pth"
TEST_IMAGE_PATH = r"D:\Agri-Vision\pineappletest.png"

OUTPUT_IMAGE_PATH = r"C:\Pineapple Thesis\PINEAPPLE\pipeline_result.jpg"

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
state_dict = torch.load(
    EFFNET_MODEL_PATH,
    map_location=device,
    weights_only=True
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

# --- 7. Run YOLO Detection ---
print("\nRunning YOLO detection...")
results = yolo_model(img, verbose=False)[0]

detection_count = 0

# --- 8. Process YOLO Boxes ---
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

    # --- 9. Crop Detection ---
    crop = img[y1:y2, x1:x2]

    if crop.size == 0:
        print("ERROR: Crop size is 0, skipping EfficientNet.")
        continue

    print(f"Crop shape extracted: {crop.shape}")

    # --- 10. Prepare Crop for EfficientNet ---
    crop_rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
    crop_pil = Image.fromarray(crop_rgb)

    input_tensor = effnet_transforms(crop_pil).unsqueeze(0).to(device)

    # --- 11. EfficientNet Classification ---
    with torch.no_grad():
        outputs = effnet_model(input_tensor)
        probabilities = torch.nn.functional.softmax(outputs, dim=1)[0]

        confidence, predicted_idx = torch.max(probabilities, 0)

        final_class = CLASS_NAMES[predicted_idx.item()]
        effnet_conf_score = confidence.item()

    print(f"EfficientNet classified it as: {final_class}")
    print(f"EfficientNet confidence: {effnet_conf_score * 100:.1f}%")

    # --- 12. Draw Result ---
    label = f"{final_class}: {effnet_conf_score * 100:.1f}%"

    cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 0), 4)

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
        (0, 255, 0),
        thickness
    )

# --- 13. Final Output ---
if detection_count == 0:
    print("\nNo YOLO detections passed the confidence threshold.")
    print("Try lowering YOLO_CONF_THRESHOLD to 0.05 for testing.")

cv2.imwrite(OUTPUT_IMAGE_PATH, img)

print("\n======================================")
print("Pipeline finished.")
print(f"Total detections: {detection_count}")
print(f"Result saved to: {OUTPUT_IMAGE_PATH}")
print("======================================")

cv2.imshow("AGRI-VISION Two-Stage Pipeline", img)
cv2.waitKey(0)
cv2.destroyAllWindows()