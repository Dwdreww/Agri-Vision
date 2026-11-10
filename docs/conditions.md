# Pineapple condition types

## Current model status — November 3, 2026

The active scanner pairs YOLOv8m regions with the replacement EfficientNet-B0.
The supplied metrics confirm outputs 0–3 as `No_Disease`, `fruit_fasciation`,
`fruit_rot`, and `mutli_crown`. They map to No Disease, Fruit Fasciation Disorder,
Fruit Rot Disease, and Multiple Crown Disorder respectively. The raw training
spelling is preserved separately from the readable canonical condition.

The seven labels below remain the full reference for current and historical
records. Crown Rot, Mealybug Wilt and Root Rot are shown as earlier-model-only
labels in the guide; the current classifier cannot predict them. See
[model inventory](../models/README.md).

The UI derives a condition type from the existing model label. It does not change
stored predictions, backend contracts, research exports, or model capabilities.
The seven reference labels for historical classifications are listed in `src/conditions.js`.

| Model label | Display type |
| --- | --- |
| Crown Rot Disease | Pathological disease |
| Fruit Rot Disease | Pathological disease |
| Mealybug Wilt Disease | Pathological disease |
| Root Rot Disease | Pathological disease |
| Fruit Fasciation Disorder | Physiological disorder |
| Multiple Crown Disorder | Physiological disorder |
| No Disease | No disease detected |

Unknown labels and **No Detection** are **Unclassified**, never healthy. A
classification describes the model's suggested condition, not severity or a
confirmed causal diagnosis. In particular, broad rot labels do not identify a
specific organism. Physiological categories describe these model classes;
they do not establish the cause of an individual abnormal fruit from a photo.

## References checked 2026-10-08

- [National Horticulture Board, India: Pineapple disorders](https://nhb.gov.in/pdf/fruits/pineapple/pin003.pdf)
  describes multiple crowns and fruit/crown fasciation as developmental disorders.
- [International Tropical Fruits Network: Pineapple agronomy](https://www.itfnet.org/v1/2016/05/pineapple-agronomy/)
  lists multiple crowns under physiological disorders.
- [University of Hawai‘i CTAHR: Heart and Root Rots of Pineapple](https://www.ctahr.hawaii.edu/oc/freepubs/pdf/PD-106.pdf)
  describes pathogen-associated central/heart and root rots. Crown Rot is the model's
  broad label; the UI does not equate it with a specific confirmed heart-rot pathogen.
- [Tamil Nadu Agricultural University: Leaf and fruit rot](https://agritech.tnau.ac.in/crop_protection/pineapple_diseases_2.html)
  describes fungal disease affecting pineapple tissues and fruit.
- [University of Hawai‘i CTAHR: Pineapple mealybug management](https://www3.ctahr.hawaii.edu/t-star/PineappleMB.htm)
  describes mealybug feeding and interactions with viral pathogens.
