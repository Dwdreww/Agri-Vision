"""
train_efficientnet.py
Supervised fine-tuning of EfficientNet-B0 on pineapple disease crops.
Evaluates Precision, Recall, F1-Score (per-class & macro), and Confusion Matrix.
"""

import json
from pathlib import Path
import matplotlib.pyplot as plt
import numpy as np
from sklearn.metrics import classification_report, confusion_matrix
import torch
import torch.nn as nn
import torch.optim as optim
from torchvision import datasets, models, transforms

# 1. Device Configuration
device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
print(f"[Init] Compute Device: {device}")
if device.type == "cuda":
  print(f"[Init] Active GPU: {torch.cuda.get_device_name(0)}")

# 2. Data Transformations & Augmentation
DATA_DIR = Path("efficientnet_dataset")

data_transforms = {
    "train": transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.RandomHorizontalFlip(p=0.5),
        transforms.RandomVerticalFlip(p=0.2),
        transforms.RandomRotation(degrees=15),
        transforms.ColorJitter(
            brightness=0.15, contrast=0.15, saturation=0.1
        ),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ]),
    "val": transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ]),
}

# 3. Dataset & Dataloaders Setup
if not (DATA_DIR / "train").exists() or not (DATA_DIR / "test").exists():
  raise FileNotFoundError(
      f"Dataset directory '{DATA_DIR}' must contain 'train' and 'test' folders."
  )

image_datasets = {
    phase: datasets.ImageFolder(DATA_DIR / phase, data_transforms[phase])
    for phase in ["train", "test"]
}

dataloaders = {
    "train": torch.utils.data.DataLoader(
        image_datasets["train"],
        batch_size=16,
        shuffle=True,
        num_workers=0,
        pin_memory=True,
    ),
    "val": torch.utils.data.DataLoader(
        image_datasets["test"],
        batch_size=16,
        shuffle=False,
        num_workers=0,
        pin_memory=True,
    ),
}

class_names = image_datasets["train"].classes
num_classes = len(class_names)
print(f"[Data] Found {len(image_datasets['train'])} training images.")
print(f"[Data] Found {len(image_datasets['test'])} validation images.")
print(f"[Data] Classes ({num_classes}): {class_names}")

# 4. Model Definition (EfficientNet-B0 Transfer Learning)
print("[Model] Loading pre-trained EfficientNet-B0 weights...")
weights = models.EfficientNet_B0_Weights.DEFAULT
model = models.efficientnet_b0(weights=weights)

# Replace the final linear classification head
in_features = model.classifier[1].in_features
model.classifier[1] = nn.Sequential(
    nn.Dropout(p=0.3, inplace=True), nn.Linear(in_features, num_classes)
)
model = model.to(device)

criterion = nn.CrossEntropyLoss()
optimizer = optim.AdamW(
    model.parameters(), lr=0.0003, weight_decay=1e-4
)
epochs = 30
scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)

# 5. Training Loop
best_val_acc = 0.0
best_model_weights_path = Path("efficientnet_pineapple_best.pth")

print("\n" + "=" * 60)
print(f"Starting Training for {epochs} Epochs")
print("=" * 60)

for epoch in range(1, epochs + 1):
  print(f"\nEpoch {epoch}/{epochs}")
  print("-" * 30)

  for phase in ["train", "val"]:
    if phase == "train":
      model.train()
    else:
      model.eval()

    running_loss = 0.0
    running_corrects = 0

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
      running_corrects += torch.sum(preds == labels.data)

    if phase == "train":
      scheduler.step()

    epoch_loss = running_loss / len(image_datasets[phase])
    epoch_acc = (running_corrects.double() / len(image_datasets[phase])).item()

    print(
        f"{phase.upper():5s} | Loss: {epoch_loss:.4f} | Accuracy:"
        f" {epoch_acc * 100:.2f}%"
    )

    # Save checkpoint when validation accuracy improves
    if phase == "val" and epoch_acc > best_val_acc:
      best_val_acc = epoch_acc
      torch.save(model.state_dict(), best_model_weights_path)
      print(
          f"  --> Saved new best checkpoint (Val Acc: {best_val_acc * 100:.2f}%)"
      )

print(
    f"\nTraining Complete! Best Validation Accuracy: {best_val_acc * 100:.2f}%"
)

# 6. Detailed Evaluation on Best Weights (Precision, Recall, F1, Confusion Matrix)
print("\n" + "=" * 60)
print("Evaluating Best Model Checkpoint...")
print("=" * 60)

model.load_state_dict(torch.load(best_model_weights_path))
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

# Generate Classification Metrics
report = classification_report(
    all_labels,
    all_preds,
    target_names=class_names,
    digits=4,
    output_dict=True,
)
conf_mat = confusion_matrix(all_labels, all_preds)

print("\nPER-CLASS PERFORMANCE REPORT:")
print(
    classification_report(all_labels, all_preds, target_names=class_names, digits=4)
)

print("CONFUSION MATRIX:")
print(conf_mat)

# Save Metrics to Files
output_metrics = {
    "best_val_accuracy": best_val_acc,
    "classification_report": report,
    "confusion_matrix": conf_mat.tolist(),
    "class_indices": {i: name for i, name in enumerate(class_names)},
}

with open("efficientnet_metrics.json", "w", encoding="utf-8") as f:
  json.dump(output_metrics, f, indent=4)

with open("efficientnet_report.txt", "w", encoding="utf-8") as f:
  f.write("EFFICIENTNET-B0 PINEAPPLE DISEASE CLASSIFICATION REPORT\n")
  f.write("=" * 60 + "\n\n")
  f.write(
      classification_report(all_labels, all_preds, target_names=class_names, digits=4)
  )
  f.write("\n\nConfusion Matrix:\n")
  f.write(str(conf_mat))

print("\n[Done] Model weights saved as: efficientnet_pineapple_best.pth")
print("[Done] Metrics report saved as: efficientnet_report.txt")