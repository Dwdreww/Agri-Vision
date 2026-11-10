"""
train_efficientnet.py
Supervised fine-tuning of EfficientNet-B0 on pineapple crops with:
- Aspect-ratio preserving padding (SquarePad)
- Automated class-weighted CrossEntropyLoss
- Differential backbone/head learning rates
- Comprehensive validation metrics (Accuracy, Precision, Recall, Macro/Weighted F1)
- Checkpointing based on Validation Macro F1-score
"""

from collections import Counter
import json
from pathlib import Path
import matplotlib.pyplot as plt
import numpy as np
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
import torch
import torch.nn as nn
import torch.optim as optim
from torchvision import datasets, models, transforms
import torchvision.transforms.functional as TF

# 1. Device Configuration
device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
print(f"[Init] Compute Device: {device}")
if device.type == "cuda":
    print(f"[Init] Active GPU: {torch.cuda.get_device_name(0)}")


# 2. Square Pad to Preserve Morphological Aspect Ratio
class SquarePad:
    def __call__(self, image):
        w, h = image.size
        max_wh = max(w, h)
        hp = (max_wh - w) // 2
        vp = (max_wh - h) // 2
        padding = (hp, vp, max_wh - w - hp, max_wh - h - vp)
        return TF.pad(image, padding, fill=0, padding_mode="constant")


DATA_DIR = Path("efficientnet_dataset")

data_transforms = {
    "train": transforms.Compose([
        SquarePad(),
        transforms.Resize((224, 224)),
        transforms.RandomHorizontalFlip(p=0.5),
        transforms.RandomVerticalFlip(p=0.2),
        transforms.RandomRotation(degrees=10),
        transforms.ColorJitter(brightness=0.15, contrast=0.15, saturation=0.1),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ]),
    "val": transforms.Compose([
        SquarePad(),
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ]),
}

# 3. Dataset & Dataloaders Setup
if not (DATA_DIR / "train").exists() or not (DATA_DIR / "val").exists():
    raise FileNotFoundError(f"Dataset directory '{DATA_DIR}' must contain 'train' and 'val' folders.")

image_datasets = {
    phase: datasets.ImageFolder(DATA_DIR / phase, data_transforms[phase])
    for phase in ["train", "val"]
}

dataloaders = {
    phase: torch.utils.data.DataLoader(
        image_datasets[phase],
        batch_size=16,
        shuffle=(phase == "train"),
        num_workers=0,
        pin_memory=True,
    )
    for phase in ["train", "val"]
}

class_names = image_datasets["train"].classes
num_classes = len(class_names)
print(f"[Data] Found {len(image_datasets['train'])} training images.")
print(f"[Data] Found {len(image_datasets['val'])} validation images.")
print(f"[Data] Classes ({num_classes}): {class_names}")

# Compute Class Weights to balance penalty across classes
train_targets = [sample[1] for sample in image_datasets["train"].samples]
class_counts = Counter(train_targets)
total_train_samples = len(train_targets)
class_weights = [
    total_train_samples / (num_classes * class_counts[i]) for i in range(num_classes)
]
weights_tensor = torch.tensor(class_weights, dtype=torch.float).to(device)
print(f"[Data] Balanced Class Weights: {[round(w, 3) for w in class_weights]}")

# 4. Model Definition & Differential Learning Rates
print("[Model] Loading pre-trained EfficientNet-B0 weights...")
weights = models.EfficientNet_B0_Weights.DEFAULT
model = models.efficientnet_b0(weights=weights)

in_features = model.classifier[1].in_features
model.classifier[1] = nn.Sequential(
    nn.Dropout(p=0.3, inplace=True),
    nn.Linear(in_features, num_classes),
)
model = model.to(device)

criterion = nn.CrossEntropyLoss(weight=weights_tensor)

backbone_params = [p for n, p in model.named_parameters() if "classifier" not in n]
head_params = model.classifier.parameters()

optimizer = optim.AdamW([
    {"params": backbone_params, "lr": 5e-5},
    {"params": head_params, "lr": 5e-4},
], weight_decay=1e-4)

epochs = 35
scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)

# 5. Training Loop with Multi-Metric Tracking & Macro F1 Checkpointing
best_val_f1 = 0.0
best_model_weights_path = Path("efficientnet_pineapple_best.pth")

print("\n" + "=" * 80)
print(f"Starting Training for {epochs} Epochs (Tracking Acc, Precision, Recall, Macro F1)")
print("=" * 80)

for epoch in range(1, epochs + 1):
    print(f"\nEpoch {epoch}/{epochs}")
    print("-" * 40)

    for phase in ["train", "val"]:
        if phase == "train":
            model.train()
        else:
            model.eval()

        running_loss = 0.0
        phase_preds = []
        phase_labels = []

        for inputs, labels in dataloaders[phase]:
            inputs = inputs.to(device, non_blocking=True)
            labels = labels.to(device, non_blocking=True)

            optimizer.zero_grad()

            with torch.set_grad_enabled(phase == "train"):
                outputs = model(inputs)
                _, preds = torch.max(outputs, 1)
                loss = criterion(outputs, labels)

                if phase == "train":
                    loss.backward()
                    optimizer.step()

            running_loss += loss.item() * inputs.size(0)
            phase_preds.extend(preds.cpu().numpy())
            phase_labels.extend(labels.cpu().numpy())

        if phase == "train":
            scheduler.step()

        # Metrics calculation
        epoch_loss = running_loss / len(image_datasets[phase])
        epoch_acc = accuracy_score(phase_labels, phase_preds)
        epoch_recall = recall_score(phase_labels, phase_preds, average="macro", zero_division=0)
        epoch_precision = precision_score(phase_labels, phase_preds, average="macro", zero_division=0)
        epoch_macro_f1 = f1_score(phase_labels, phase_preds, average="macro", zero_division=0)
        epoch_weighted_f1 = f1_score(phase_labels, phase_preds, average="weighted", zero_division=0)

        print(
            f"{phase.upper():5s} | Loss: {epoch_loss:.4f} | Acc: {epoch_acc * 100:.2f}% | "
            f"Recall: {epoch_recall:.4f} | Prec: {epoch_precision:.4f} | "
            f"Macro F1: {epoch_macro_f1:.4f} | W-F1: {epoch_weighted_f1:.4f}"
        )

        # Checkpoint based on balanced Macro F1
        if phase == "val" and epoch_macro_f1 > best_val_f1:
            best_val_f1 = epoch_macro_f1
            torch.save(model.state_dict(), best_model_weights_path)
            print(f"  --> Saved new best checkpoint (Macro F1: {best_val_f1:.4f})")

print(f"\nTraining Complete! Best Validation Macro F1: {best_val_f1:.4f}")

# 6. Detailed Evaluation on Best Saved Weights
print("\n" + "=" * 80)
print(f"Loading best weights from '{best_model_weights_path}' for Final Evaluation")
print("=" * 80)

model.load_state_dict(torch.load(best_model_weights_path, weights_only=True))
model.eval()

all_preds = []
all_labels = []

with torch.no_grad():
    for inputs, labels in dataloaders["val"]:
        inputs = inputs.to(device)
        outputs = model(inputs)
        _, preds = torch.max(outputs, 1)
        all_preds.extend(preds.cpu().numpy())
        all_labels.extend(labels.numpy())

all_preds = np.array(all_preds)
all_labels = np.array(all_labels)

# Metric Calculations
val_acc = accuracy_score(all_labels, all_preds)
val_recall_macro = recall_score(all_labels, all_preds, average="macro", zero_division=0)
val_recall_weighted = recall_score(all_labels, all_preds, average="weighted", zero_division=0)
val_precision_macro = precision_score(all_labels, all_preds, average="macro", zero_division=0)
val_f1_macro = f1_score(all_labels, all_preds, average="macro", zero_division=0)
val_f1_weighted = f1_score(all_labels, all_preds, average="weighted", zero_division=0)

print("\n--- OVERALL VALIDATION SUMMARY ---")
print(f"Overall Accuracy:  {val_acc * 100:.2f}%")
print(f"Macro Recall:      {val_recall_macro:.4f}")
print(f"Weighted Recall:   {val_recall_weighted:.4f}")
print(f"Macro Precision:   {val_precision_macro:.4f}")
print(f"Macro F1-Score:    {val_f1_macro:.4f}")
print(f"Weighted F1-Score: {val_f1_weighted:.4f}")

print("\n--- PER-CLASS BREAKDOWN ---")
print(classification_report(all_labels, all_preds, target_names=class_names, digits=4, zero_division=0))

print("--- CONFUSION MATRIX ---")
conf_mat = confusion_matrix(all_labels, all_preds)
print(conf_mat)