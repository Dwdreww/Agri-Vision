// Explicit release allowlist: no local photos, credentials or QA output is copied.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'output', 'release-2026-11-04', 'backend');
const files = ['app.py', 'scanner_models.py', 'scanner_auth.py', 'requirements.txt', 'Dockerfile', '.dockerignore',
  'models/bestv4.pt', 'models/efficientnet_pineapple_bestv2.pth', 'models/efficientnet_metrics.json'];
await fs.mkdir(output, { recursive: true });
const manifest = [];
for (const file of files) {
  const source = path.join(root, file);
  const target = path.join(output, file);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
  const bytes = await fs.readFile(target);
  manifest.push({ file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
await fs.writeFile(path.join(output, 'README.md'), `---
title: Agri Vision Backend
colorFrom: green
colorTo: yellow
sdk: docker
app_port: 7860
---

# Agri-Vision model demo API

YOLOv8m bestv4.pt selects candidate regions and EfficientNet-B0
efficientnet_pineapple_bestv2.pth assigns four condition classes to the
unannotated bounding-box crops only. Both original and
YOLO crop image versions are returned. Firebase sign-in is required. Uploaded photos are processed
in memory; this model service does not save photo or scan records.

The public frontend is https://agri-vision-eosin.vercel.app/.
This Space runs only the model API and does not retain a second interface.
Its root returns API information; /api/health reports readiness and /api/predict
accepts an image with a Firebase ID token.
The authenticated workspace on Vercel provides private photo persistence and
Gemini recommendations. This model service only performs inference in memory.

Runtime variables: FIREBASE_AUTH_MODE=rest, FIREBASE_PROJECT_ID, and the public
FIREBASE_WEB_API_KEY. The local owner's Admin credentials must not be uploaded.
`);
await fs.writeFile(path.join(root, 'output', 'release-2026-11-04', 'backend-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Prepared ${files.length + 1} backend release files (${manifest.reduce((sum, file) => sum + file.bytes, 0)} bytes).`);
