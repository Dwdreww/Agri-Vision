# EfficientNet acceptance threshold — 4 November 2026

The user requested 0.35 for EfficientNet. `EFFNET_CONF_THRESHOLD` defaults to
0.35, accepts a finite value between zero and one, and is explicitly set to 0.35
in the existing free CPU deployment. YOLO remains at 0.65.

Each YOLO crop is classified as before. A maximum softmax probability **>= 0.35**
accepts the condition; lower probabilities produce **Uncertain**, with no
condition index/name. Raw confidence, the box, and both photo versions remain.
`classification_available` indicates classifier availability, while the new
`classification_accepted` flag records whether the output passed the threshold.

An accepted disease/disorder still takes summary priority. With no accepted
concern, any uncertain crop keeps the overall summary Uncertain/Monitor rather
than Healthy. No boxes remains No Detection and never calls EfficientNet.
Recommendations ignore rejected conditions and return inconclusive inspection
guidance when any region lacks an accepted classification.

The policy change is versioned `roi-v3`; weights, class order, preprocessing and
historical saved predictions are unchanged. New records save the threshold with
their model metadata. Existing ROI v1/v2 recommendation normalization remains.

Validation: 28 Python scanner/model/auth tests, 72 recommendation/service tests,
74 JavaScript tests and the Vite build passed. Boundary tests cover below,
exactly at, and above 0.35; crop retention; mixed healthy/uncertain regions; and
rejected-condition exclusion from advice. Health reports both configured values.
Live evidence is in ignored `output/effnet-threshold-35-2026-11-04/`.
