import { numericConfidence } from './confidence.js';

export function isDetectionOnly(result) {
  if (!result || result.isPhotoOnly || result.is_photo_only) return false;
  return result.classification_available === false || result.classificationAvailable === false
    || result.inference_mode === 'detection-only' || result.inferenceMode === 'detection-only'
    || (result.model_version || result.modelVersion || '').startsWith('detection-only-');
}

// Coordinates refer to the full prepared photo, before any display letterboxing.
export function detectionRegions(detections, width, height) {
  if (!Array.isArray(detections) || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return [];
  return detections.flatMap((detection, index) => {
    const box = detection?.bbox;
    if (!box || !['x1', 'y1', 'x2', 'y2'].every(key => Number.isFinite(box[key]))) return [];
    const x1 = Math.max(0, Math.min(width, box.x1));
    const y1 = Math.max(0, Math.min(height, box.y1));
    const x2 = Math.max(0, Math.min(width, box.x2));
    const y2 = Math.max(0, Math.min(height, box.y2));
    if (x2 <= x1 || y2 <= y1) return [];
    return [{ id: index + 1, x1, y1, x2, y2, detection }];
  });
}

export function detectorConfidence(detection) {
  const percent = numericConfidence(detection?.yolo_confidence_percent);
  if (percent !== null) return percent;
  const fraction = detection?.yolo_confidence;
  return typeof fraction === 'number' && Number.isFinite(fraction) && fraction >= 0 && fraction <= 1
    ? fraction * 100 : null;
}
