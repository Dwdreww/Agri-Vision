"""Run the paired YOLO/EfficientNet backend on a local image without HTTP/auth."""
import argparse
import base64
import json
import tempfile
from pathlib import Path

from app import run_pipeline

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("image", nargs="?", default="assets/plates/preview-photo.webp")
    parser.add_argument("--output", default="outputs/paired-result.jpg")
    parser.add_argument("--versions-dir",
                        help="Directory for the original, each YOLO box crop, and result.json")
    args = parser.parse_args()
    if args.versions_dir:
        versions_dir = Path(args.versions_dir)
        if versions_dir.exists() and any(versions_dir.iterdir()):
            parser.error("--versions-dir must be empty so crops from different runs cannot be mixed.")
        versions_dir.mkdir(parents=True, exist_ok=True)
    else:
        parent = Path("outputs/scan-versions")
        parent.mkdir(parents=True, exist_ok=True)
        versions_dir = Path(tempfile.mkdtemp(prefix=Path(args.image).stem + "-", dir=parent))
    result = run_pipeline(Path(args.image).read_bytes())
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(base64.b64decode(result.pop("annotated_image").split(",", 1)[1]))
    versions = result.pop("image_versions")
    original = versions_dir / "original.jpg"
    original.write_bytes(base64.b64decode(versions["original"].split(",", 1)[1]))
    result["image_versions"] = {"original": original.name, "yolo_crops": []}
    for crop in versions["yolo_crops"]:
        crop_file = versions_dir / f"yolo-crop-{crop['region_id']:03d}.jpg"
        crop_file.write_bytes(base64.b64decode(crop["image"].split(",", 1)[1]))
        result["image_versions"]["yolo_crops"].append({
            **{key: value for key, value in crop.items() if key != "image"},
            "file": crop_file.name
        })
    (versions_dir / "result.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))
    print(f"YOLO region image saved to {output}")
    print(f"Original and classified YOLO crops saved to {versions_dir}")
