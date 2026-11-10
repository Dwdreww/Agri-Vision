import test from 'node:test';
import assert from 'node:assert/strict';
import { detectionRegions, detectorConfidence, isDetectionOnly } from '../src/detection-regions.js';

test('detection-only state survives saving without reinterpreting historical results or guest photos', () => {
  assert.equal(isDetectionOnly({ classification_available: false }), true);
  assert.equal(isDetectionOnly({ classificationAvailable: false, inferenceMode: 'detection-only' }), true);
  assert.equal(isDetectionOnly({ modelVersion: 'detection-only-yolov8m-123-v1' }), true);
  assert.equal(isDetectionOnly({ topClass: 'Fruit Rot Disease', modelVersion: 'pilot-v1' }), false);
  assert.equal(isDetectionOnly({ classification_available: true, inference_mode: 'region-classification' }), false);
  assert.equal(isDetectionOnly({ classificationAvailable: true, inferenceMode: 'region-classification', modelVersion: 'yolov8m-qa-effnetb0-qa-roi-v1' }), false);
  assert.equal(isDetectionOnly({ isPhotoOnly: true, classificationAvailable: false }), false);
  assert.equal(isDetectionOnly(null), false);
});

test('region coordinates retain their full-image reference and detector metadata', () => {
  const detection = { bbox: { x1: 120, y1: 40, x2: 510, y2: 470 }, detector_class_name: 'potted plant', class_name: 'Fruit_Rot_Disease' };
  assert.deepEqual(detectionRegions([detection], 640, 480), [{ id: 1, x1: 120, y1: 40, x2: 510, y2: 470, detection }]);
});

test('boxes are clipped to the photo without fabricating or reordering regions', () => {
  const invalid = { bbox: { x1: 80, y1: 40, x2: 20, y2: 90 } };
  const valid = { bbox: { x1: -20, y1: 10, x2: 700, y2: 600 } };
  assert.deepEqual(detectionRegions([invalid, valid], 640, 480), [{ id: 2, x1: 0, y1: 10, x2: 640, y2: 480, detection: valid }]);
});

test('missing, non-finite, collapsed and out-of-frame boxes are never drawn', () => {
  const boxes = [null, {}, { bbox: { x1: NaN, y1: 0, x2: 100, y2: 100 } }, { bbox: { x1: 0, y1: 0, x2: 0, y2: 100 } }, { bbox: { x1: 700, y1: 0, x2: 800, y2: 100 } }];
  assert.deepEqual(detectionRegions(boxes, 640, 480), []);
});

test('no detections and unavailable image dimensions never create fallback boxes', () => {
  const detections = [{ bbox: { x1: 0, y1: 0, x2: 10, y2: 10 } }];
  assert.deepEqual(detectionRegions([], 640, 480), []);
  assert.deepEqual(detectionRegions(detections, undefined, 480), []);
  assert.deepEqual(detectionRegions(detections, 640, 0), []);
  assert.deepEqual(detectionRegions(detections, -1, 480), []);
});

test('YOLO confidence uses detector scores, preserves zero, and never substitutes classifier scores', () => {
  assert.equal(detectorConfidence({ yolo_confidence_percent: 0, efficientnet_confidence_percent: 95 }), 0);
  assert.equal(detectorConfidence({ yolo_confidence: 0.42 }), 42);
  assert.equal(detectorConfidence({ yolo_confidence: 1.2 }), null);
  assert.equal(detectorConfidence({ efficientnet_confidence_percent: 95 }), null);
  assert.equal(detectorConfidence({ yolo_confidence: NaN }), null);
});
