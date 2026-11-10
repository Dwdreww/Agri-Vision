# AgriVision

A responsive pineapple field-record system, available at [AgriVision](https://agri-vision-eosin.vercel.app/).

Signed-in users keep photo checks, farms, growing areas, field notes and care
tasks in a private account across devices. Firebase Authentication and Firestore
provide accounts and record metadata. Vercel Private Blob stores photos, and
an authenticated Vercel API serves photos, recommendations and account actions.
The model runs on the existing free Hugging Face CPU Space. The Mac does not
need to stay running for deployed users.

The current release uses the pineapple gold, leaf green and ivory interface in
React/CSS. Main navigation is Home, Photo check and Records. Growing areas and
Settings are secondary destinations. See [interface notes](DESIGN.md).

## Photos and model results

YOLOv8m `models/bestv3.pt` selects regions at a default threshold of **0.65**.
The unannotated rectangular crops go to EfficientNet-B0
(`models/efficientnet_pineapple_bestv2.pth`). A crop needs at least **0.35**
classifier confidence. Lower scores are **Uncertain**. No detected region
means no classification. Results show the original scan photo. The four
confirmed outputs are No Disease, Fruit Fasciation Disorder,
Fruit Rot Disease and Multiple Crown Disorder.

Current version: `yolov8m-28a5c00ab63b-effnetb0-03af1ac8bba3-roi-v3`.
See [model inventory](models/README.md) for hashes, preparation and verification
limits. These model suggestions support field inspection; confidence is not a
measure of disease severity or verified field accuracy.

Optional **Recommendations** send the original scan photo and validated model
result to Google Gemini after the grower opts in. Account information and
field notes stay in the workspace. Saved advice remains private and available
across devices. See [recommendation behavior](docs/ai-recommendations.md).

## Guest records

Guest entry requires no account. Its records and photos stay in that browser;
photos are marked **Not analyzed**. Export a backup in guest Settings, sign in,
then use **Settings → Import guest backup** to choose a destination account.
The import preview shows counts and account identity. Repeated imports skip
existing records and leave the original guest history intact.

English/Filipino and light/dark themes are supported. Signed-in appearance and
recommendation choices are saved with the account; guest preferences remain
browser-local.

## Development and deployment

Use Node 22, `npm ci`, and `npm run dev`. Copy `.env.example` into an ignored
local environment file and supply the project's public Firebase web settings.
Cloud mode proxies API requests to the deployed workspace. `npm run build`
prepares the frontend; `npm test`, `npm test --prefix functions`, and the Python
suite validate the application. Python dependencies and model files are needed
only for local inference or a backend release.

See [deployment instructions](DEPLOYMENT.md) and the [cloud migration report](docs/cloud-workspace-2026-11-04.md).
The release stays on free services. Firebase billing remains disabled, Vercel
uses Hobby, and the model Space uses CPU Basic. Quotas and model-host sleep
remain deployment constraints.
