# Visible YOLO regions — October 28, 2026

> Historical record. On November 2, 2026, the old classifier and original detector were removed. Current setup: [model reset](model-reset-2026-11-02.md).

The scan result now shows the actual detector bounding boxes directly over the
prepared photo. The same viewer is available in saved photo record details.

- The default view shows numbered boxes; Original photo hides the overlay.
- Selecting a region button highlights its box. Selecting it again restores all boxes.
- Each region shows YOLO confidence and the recorded detector label separately from
  the EfficientNet condition label and classifier confidence.
- The image and SVG use the same centered containment and full-image coordinates.
  Portrait and wide photos retain their full frame without cropping or stretching.
- No detections means no boxes. Invalid or missing coordinates are never invented.
  Saved detections without coordinates explain that coordinates are unavailable.
- Photo-only guest records remain unanalyzed. Existing weights, predictions, saved
  records, authenticated photo access and inference API contracts are unchanged.

The current test detector can select general objects, so the interface calls these
model-selected regions rather than confirmed affected tissue or disease boundaries.

## Verification

- 59 frontend tests passed, including five new coordinate/confidence regressions.
- Production build passed; the existing large workspace chunk warning remains.
- The new viewer source passed the design skill's app lint with no failures or warnings.
- A real saved two-region scan rendered its 450×600 coordinate space against the
  original 450×600 photo. The image and overlay had identical displayed dimensions.
- Original photo removed the overlay; region selection restored it and dimmed the
  other box. Desktop, 768px tablet and 390px phone layouts were checked. Phone
  toggles were 44px tall, and the page had no horizontal overflow.
- A real saved no-detection result showed the no-region explanation and zero overlays.
- Screenshots: `output/yolo-region-view/desktop.png` and `mobile.png`.
