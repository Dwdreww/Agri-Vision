"""Deploy the allowlisted, credential-free demo to the existing CPU Space.

Run with the isolated deployment-tools Python after `hf auth login`.
This does not create a Space or change hardware/billing.
"""
import hashlib
import json
from pathlib import Path

from huggingface_hub import CommitOperationAdd, CommitOperationDelete, HfApi

root = Path(__file__).resolve().parent.parent
release = root / "output/release-2026-11-04"
folder = release / "backend"
repo = "Drewtopiaa/AgriVision"
api = HfApi()
identity = api.whoami()
if identity["name"].lower() != "drewtopiaa":
    raise SystemExit("Sign in as the owner of Drewtopiaa/AgriVision before deploying.")
manifest = json.loads((release / "backend-manifest.json").read_text())
for item in manifest:
    data = (folder / item["file"]).read_bytes()
    if len(data) != item["bytes"] or hashlib.sha256(data).hexdigest() != item["sha256"]:
        raise SystemExit(f"Release artifact changed: {item['file']}")

config = {}
for line in (root / ".env").read_text().splitlines():
    if "=" in line and not line.lstrip().startswith("#"):
        key, value = line.split("=", 1)
        config[key.strip()] = value.strip().strip("\"'")
for key in ("VITE_FIREBASE_PROJECT_ID", "VITE_FIREBASE_API_KEY"):
    if not config.get(key):
        raise SystemExit(f"Missing public Firebase configuration: {key}")

info = api.repo_info(repo, repo_type="space")
runtime = api.get_space_runtime(repo)
if runtime.hardware not in (None, "cpu-basic") or runtime.requested_hardware not in (None, "cpu-basic"):
    raise SystemExit("The existing Space is not on free CPU hardware; no changes made.")
current_variables = api.get_space_variables(repo)
for key, value in {
    "FIREBASE_AUTH_MODE": "rest",
    "FIREBASE_PROJECT_ID": config["VITE_FIREBASE_PROJECT_ID"],
    "FIREBASE_WEB_API_KEY": config["VITE_FIREBASE_API_KEY"],
    "FRONTEND_ORIGIN": "https://agri-vision-eosin.vercel.app",
    "EFFNET_CONF_THRESHOLD": "0.35",
}.items():
    if key not in current_variables or current_variables[key].value != value:
        api.add_space_variable(repo, key, value)

files = [item["file"] for item in manifest] + ["README.md"]
operations = [CommitOperationAdd(path_in_repo=file, path_or_fileobj=str(folder / file)) for file in files]
existing = set(api.list_repo_files(repo, repo_type="space"))
removed = [file for file in (
    "yolov8.pt", "efficientnetB0.pth", "index.html", "app.js", "style.css",
    "models/bestv4.pt", "models/efficientnet_pineapple_best.pth",
    "api/health.mjs", "api/predict.mjs", "vercel.json",
) if file in existing]
operations.extend(CommitOperationDelete(path_in_repo=file) for file in removed)
commit = api.create_commit(repo, repo_type="space", parent_commit=info.sha,
    operations=operations,
    commit_message="Restore the YOLO bestv3 detector")
evidence = {"repository": repo, "commit": commit.oid, "url": commit.commit_url,
    "removedLegacyFiles": removed, "hardware": "cpu-basic", "authMode": "rest"}
(release / "backend-deployment.json").write_text(json.dumps(evidence, indent=2) + "\n")
print(json.dumps(evidence))
