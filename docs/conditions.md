# Pineapple condition types

The UI derives a condition type from the existing model label. It does not change
stored predictions, backend contracts, research exports, or model capabilities.
The seven supported classes are listed in `app.py`.

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
