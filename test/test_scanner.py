"""Paired YOLO/EfficientNet scanner contracts using the replacement weights."""
import io
import os
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

os.environ.setdefault("FIREBASE_PROJECT_ID", "scanner-test")
import cv2
import numpy as np
import torch
import app as scanner
from scanner_models import CLASSIFIER_CONDITIONS, CLASSIFIER_LABELS, CLASSIFIER_SHA256, DETECTOR_LABELS, DETECTOR_SHA256, file_sha256, load_detector

ROOT = Path(__file__).resolve().parents[1]


class ScannerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.image = (ROOT / "assets/plates/preview-photo.webp").read_bytes()
        cls.blank = cv2.imencode(".jpg", np.zeros((96, 128, 3), dtype=np.uint8))[1].tobytes()
        cls.client = scanner.app.test_client()

    def test_only_reviewed_replacement_pair_is_loaded(self):
        self.assertFalse((ROOT / "efficientnetB0.pth").exists())
        self.assertFalse((ROOT / "yolov8.pt").exists())
        self.assertFalse((ROOT / "models/yolov8m-test.pt").exists())
        self.assertFalse((ROOT / "models/bestv3.pt").exists())
        self.assertFalse((ROOT / "models/efficientnet_pineapple_best.pth").exists())
        self.assertFalse(scanner.effnet_model.training)
        self.assertEqual(file_sha256(scanner.EFFNET_MODEL_PATH), CLASSIFIER_SHA256)
        self.assertEqual(scanner.classifier_labels, CLASSIFIER_LABELS)
        self.assertEqual(Path(scanner.YOLO_MODEL_PATH), ROOT / "models/bestv4.pt")
        self.assertFalse((ROOT / "models/yolov8m.pt").exists())
        self.assertFalse((ROOT / "models/archive/yolov8m-coco.pt").exists())
        self.assertEqual(file_sha256(scanner.YOLO_MODEL_PATH), DETECTOR_SHA256)
        self.assertEqual(scanner.yolo_model.task, "detect")
        self.assertEqual(scanner.yolo_model.names, DETECTOR_LABELS)
        self.assertEqual(scanner.yolo_model.model.model[-1].nc, 1)
        with patch("scanner_models.file_sha256", return_value="changed"):
            with self.assertRaisesRegex(ValueError, "checksum mismatch"):
                load_detector(scanner.YOLO_MODEL_PATH)

    def test_real_cpu_detection_and_jpeg_contract(self):
        result = scanner.run_pipeline(self.image)
        self.assertTrue(result["success"])
        self.assertEqual(result["scanner_profile"], "yolov8m-efficientnet-b0-regions")
        self.assertEqual(result["inference_mode"], "region-classification")
        self.assertTrue(result["classification_available"])
        self.assertEqual(result["classification_scope"], "yolo-regions")
        self.assertEqual(result["classifier_input"], "yolo-bounding-box-crops")
        self.assertRegex(result["model_version"], r"^yolov8m-[a-f0-9]{12}-effnetb0-[a-f0-9]{12}-roi-v3$")
        if result["detection_count"]:
            self.assertIn(result["top_class"], (*CLASSIFIER_CONDITIONS, "Uncertain"))
            self.assertTrue(0 <= result["top_confidence"] <= 100)
        else:
            self.assertEqual(result["top_class"], "No Detection")
            self.assertIsNone(result["top_confidence"])
        self.assertEqual(result["detection_count"], len(result["detections"]))
        for detection in result["detections"]:
            self.assertIn(detection["pretty_class_name"], (*CLASSIFIER_CONDITIONS, "Uncertain"))
            self.assertTrue(detection["classification_available"])
        import base64
        annotated = cv2.imdecode(np.frombuffer(base64.b64decode(result["annotated_image"].split(",")[1]), np.uint8), cv2.IMREAD_COLOR)
        self.assertEqual(annotated.shape[:2], (result["image_height"], result["image_width"]))

    def test_no_boxes_never_implies_healthy_or_classified(self):
        with patch.object(scanner, "yolo_model", return_value=[SimpleNamespace(boxes=[])]), \
                patch.object(scanner, "effnet_model") as classify:
            result = scanner.run_pipeline(self.blank)
        classify.assert_not_called()
        self.assertEqual(result["detection_count"], 0)
        self.assertEqual(result["top_class"], "No Detection")
        self.assertIsNone(result["top_confidence"])
        self.assertTrue(result["classification_available"])
        self.assertEqual(result["status_type"], "monitor")
        self.assertEqual(result["image_versions"]["yolo_crops"], [])
        self.assertTrue(result["image_versions"]["original"].startswith("data:image/jpeg;base64,"))

    def test_original_and_box_crops_are_distinct_and_only_unmodified_crops_reach_classifier(self):
        original = np.full((90, 120, 3), (180, 20, 40), dtype=np.uint8)
        original[10:60, 20:80] = (20, 200, 60)
        original[20:50, 30:70] = (10, 80, 240)
        image = cv2.imencode(".png", original)[1].tobytes()
        boxes = [SimpleNamespace(conf=torch.tensor([0.9]), cls=torch.tensor([0]),
                                 xyxy=torch.tensor([box])) for box in
                 ([20, 10, 80, 60], [30, 20, 70, 50])]
        seen = []
        def prepare(crop):
            seen.append(np.array(crop))
            return scanner.classifier_transform()(crop)
        with patch.object(scanner, "yolo_model", return_value=[SimpleNamespace(boxes=boxes, names={0:"item"})]), \
                patch.object(scanner, "effnet_transform", side_effect=prepare), \
                patch.object(scanner, "effnet_model", return_value=torch.eye(4)[:2]) as classify:
            result = scanner.run_pipeline(image)
        np.testing.assert_array_equal(seen[0], cv2.cvtColor(original[10:60, 20:80], cv2.COLOR_BGR2RGB))
        np.testing.assert_array_equal(seen[1], cv2.cvtColor(original[20:50, 30:70], cv2.COLOR_BGR2RGB))
        self.assertEqual(tuple(classify.call_args.args[0].shape), (2, 3, 224, 224))
        versions = result["image_versions"]
        self.assertEqual(versions["original"], scanner.encode_image_to_base64(original))
        self.assertNotEqual(versions["original"], result["annotated_image"])
        self.assertFalse(result["preprocessing_summary"]["original_classified"])
        import base64
        for region, size in zip(versions["yolo_crops"], ((50, 60), (30, 40))):
            crop = cv2.imdecode(np.frombuffer(base64.b64decode(region["image"].split(",")[1]), np.uint8), cv2.IMREAD_COLOR)
            self.assertEqual(crop.shape[:2], size)
            self.assertEqual((region["height"], region["width"]), size)
            detection = result["detections"][region["region_id"] - 1]
            self.assertEqual(region["bbox"], detection["bbox"])
            self.assertEqual(detection["classification_input"], "yolo-bounding-box-crop")

    def test_fractional_and_outside_boxes_are_clipped_before_cropping(self):
        box = SimpleNamespace(conf=torch.tensor([0.8]), cls=torch.tensor([0]),
                              xyxy=torch.tensor([[-1.2, 20.7, 140.4, 70.1]]))
        with patch.object(scanner, "yolo_model", return_value=[SimpleNamespace(boxes=[box], names={0:"item"})]), \
                patch.object(scanner, "effnet_model", return_value=torch.zeros(1,4)):
            result = scanner.run_pipeline(self.blank)
        crop = result["image_versions"]["yolo_crops"][0]
        self.assertEqual(crop["bbox"], {"x1":0,"y1":20,"x2":128,"y2":71})
        self.assertEqual((crop["width"],crop["height"]), (128,51))

    def test_every_region_is_classified_once_across_bounded_batches(self):
        boxes = [SimpleNamespace(conf=torch.tensor([0.8]), cls=torch.tensor([0]),
                                 xyxy=torch.tensor([[10, 10, 30, 30]])) for _ in range(17)]
        with patch.object(scanner, "yolo_model", return_value=[SimpleNamespace(boxes=boxes, names={0:"item"})]), \
                patch.object(scanner, "effnet_model", side_effect=[torch.zeros(16,4),torch.zeros(1,4)]) as classify:
            result = scanner.run_pipeline(self.blank)
        self.assertEqual([call.args[0].shape[0] for call in classify.call_args_list], [16,1])
        self.assertEqual(len(result["image_versions"]["yolo_crops"]),17)
        self.assertEqual([region["region_id"] for region in result["detections"]],list(range(1,18)))

    def test_real_detector_and_classifier_run_together_on_a_region_fixture(self):
        # A photo fixture checks the plumbing, not held-out crop accuracy.
        result = scanner.run_pipeline(self.image)
        self.assertGreater(result["detection_count"], 0)
        self.assertIn(result["top_class"], (*CLASSIFIER_CONDITIONS, "Uncertain"))
        for item in result["detections"]:
            index = item["classifier_class_index"]
            if item["classification_accepted"]:
                self.assertEqual(item["classifier_class_name"], CLASSIFIER_LABELS[index])
                self.assertEqual(item["pretty_class_name"], CLASSIFIER_CONDITIONS[index])
            else:
                self.assertIsNone(index)
                self.assertIsNone(item["classifier_class_name"])
                self.assertEqual(item["pretty_class_name"], "Uncertain")
            self.assertTrue(0 <= item["efficientnet_confidence_percent"] <= 100)
            self.assertTrue(0 <= item["yolo_confidence_percent"] <= 100)

    def test_sample_without_regions_stays_unclassified(self):
        with patch.object(scanner, "effnet_model") as classify:
            result = scanner.run_pipeline((ROOT / "pineappletest.png").read_bytes())
        classify.assert_not_called()
        self.assertEqual(result["detection_count"], 0)
        self.assertEqual(result["top_class"], "No Detection")
        self.assertIsNone(result["top_confidence"])

    def test_regions_use_unannotated_rgb_crops_and_separate_classifier_scores(self):
        boxes = [
            SimpleNamespace(conf=torch.tensor([0.8]), cls=torch.tensor([58]), xyxy=torch.tensor([[0.0, 0.0, 100.0, 80.0]])),
            SimpleNamespace(conf=torch.tensor([0.7]), cls=torch.tensor([0]), xyxy=torch.tensor([[-10.0, 20.0, 140.0, 150.0]])),
        ]
        original = np.full((96, 128, 3), (0, 64, 255), dtype=np.uint8)
        image = cv2.imencode(".png", original)[1].tobytes()
        logits = torch.tensor([[10.0, 0, 0, 0], [0, 0, 5.0, 0]])
        with patch.object(scanner, "yolo_model", return_value=[SimpleNamespace(boxes=boxes, names={58: "potted plant", 0: "person"})]) as run_detector, \
                patch.object(scanner, "effnet_model", return_value=logits) as classify:
            result = scanner.run_pipeline(image)
        self.assertEqual(result["top_class"], "Fruit Rot Disease")
        self.assertEqual(result["status_type"], "risk")
        self.assertEqual(result["top_confidence"], round(torch.softmax(logits, dim=1)[1, 2].item() * 100, 1))
        self.assertEqual(result["detector_top_confidence"], 80)
        self.assertEqual(result["detection_count"], 2)
        self.assertEqual(result["detections"][1]["bbox"], {"x1": 0, "y1": 20, "x2": 128, "y2": 96})
        self.assertEqual([d["detector_class_name"] for d in result["detections"]], ["potted plant", "person"])
        self.assertEqual([d["class_name"] for d in result["detections"]], ["No_Disease", "Fruit_Rot_Disease"])
        self.assertEqual([d["classifier_class_name"] for d in result["detections"]], ["No_Disease", "fruit_rot"])
        inputs = classify.call_args.args[0].cpu()
        self.assertEqual(tuple(inputs.shape), (2, 3, 224, 224))
        expected = torch.tensor([(1 - 0.485) / 0.229, (64 / 255 - 0.456) / 0.224, (0 - 0.406) / 0.225])
        torch.testing.assert_close(inputs[:, :, 112, 112], expected.expand(2, -1))
        np.testing.assert_array_equal(run_detector.call_args.args[0], original)

    def test_all_four_output_indices_have_the_confirmed_labels(self):
        boxes = [SimpleNamespace(conf=torch.tensor([0.8]), cls=torch.tensor([0]), xyxy=torch.tensor([[0, 0, 80, 80]])) for _ in range(4)]
        with patch.object(scanner, "yolo_model", return_value=[SimpleNamespace(boxes=boxes, names={0: "person"})]), \
                patch.object(scanner, "effnet_model", return_value=torch.eye(4) * 5):
            result = scanner.run_pipeline(self.blank)
        self.assertEqual([d["pretty_class_name"] for d in result["detections"]], list(CLASSIFIER_CONDITIONS))
        self.assertEqual([d["classifier_class_name"] for d in result["detections"]], list(CLASSIFIER_LABELS))
        self.assertEqual(result["detections"][3]["classifier_class_name"], "mutli_crown")

    def test_invalid_classifier_scores_are_rejected(self):
        box = SimpleNamespace(conf=torch.tensor([0.8]), cls=torch.tensor([0]), xyxy=torch.tensor([[0, 0, 80, 80]]))
        with patch.object(scanner, "yolo_model", return_value=[SimpleNamespace(boxes=[box], names={0: "person"})]), \
                patch.object(scanner, "effnet_model", return_value=torch.tensor([[0, float("nan"), 1, 2]])):
            with self.assertRaisesRegex(ValueError, "invalid output scores"):
                scanner.run_pipeline(self.blank)

    def test_effnet_threshold_accepts_exactly_35_percent_and_rejects_lower_scores_without_losing_crops(self):
        boxes = [SimpleNamespace(conf=torch.tensor([0.8]), cls=torch.tensor([0]),
                                 xyxy=torch.tensor([[0, 0, 80, 80]])) for _ in range(3)]
        probabilities = torch.tensor([[0.2, 0.25, 0.3499, 0.2001],
                                      [0.2, 0.25, 0.35, 0.2],
                                      [0.2, 0.25, 0.3501, 0.1999]])
        with patch.object(scanner, "yolo_model", return_value=[SimpleNamespace(boxes=boxes, names={0: "item"})]), \
                patch.object(scanner, "effnet_model", return_value=torch.zeros(3,4)), \
                patch.object(scanner.torch, "softmax", return_value=probabilities):
            result = scanner.run_pipeline(self.blank)
        self.assertEqual(scanner.EFFNET_CONF_THRESHOLD, 0.35)
        self.assertEqual(result["detection_count"], 3)
        self.assertEqual(len(result["image_versions"]["yolo_crops"]), 3)
        self.assertEqual(result["classified_region_count"], 2)
        self.assertEqual([d["classification_accepted"] for d in result["detections"]], [False, True, True])
        self.assertEqual(result["detections"][0]["pretty_class_name"], "Uncertain")
        self.assertIsNone(result["detections"][0]["classifier_class_index"])
        self.assertEqual(result["top_class"], "Fruit Rot Disease")

    def test_low_effnet_result_stays_uncertain_and_cannot_make_the_photo_healthy(self):
        boxes = [SimpleNamespace(conf=torch.tensor([0.8]), cls=torch.tensor([0]),
                                 xyxy=torch.tensor([[0, 0, 80, 80]])) for _ in range(2)]
        for probabilities in (torch.tensor([[0.2, 0.3, 0.34, 0.16]]),
                              torch.tensor([[0.2, 0.3, 0.34, 0.16], [0.9, 0.03, 0.03, 0.04]])):
            count = len(probabilities)
            with patch.object(scanner, "yolo_model", return_value=[SimpleNamespace(boxes=boxes[:count], names={0: "item"})]), \
                    patch.object(scanner, "effnet_model", return_value=torch.zeros(count,4)), \
                    patch.object(scanner.torch, "softmax", return_value=probabilities):
                result = scanner.run_pipeline(self.blank)
            self.assertEqual(result["top_class"], "Uncertain")
            self.assertEqual(result["status_type"], "monitor")
            self.assertEqual(result["top_confidence"], 34)
            self.assertEqual(result["detection_count"], count)

    def test_low_confidence_nonfinite_and_invalid_boxes_are_skipped(self):
        boxes = [
            SimpleNamespace(conf=torch.tensor([0.64])),
            SimpleNamespace(conf=torch.tensor([float("nan")])),
            SimpleNamespace(conf=torch.tensor([0.8]), xyxy=torch.tensor([[50, 50, 20, 20]])),
            SimpleNamespace(conf=torch.tensor([0.8]), xyxy=torch.tensor([[float("nan"), 0, 20, 20]])),
        ]
        with patch.object(scanner, "yolo_model", return_value=[SimpleNamespace(boxes=boxes)]):
            result = scanner.run_pipeline(self.blank)
        self.assertEqual(result["detection_count"], 0)
        self.assertIsNone(result["top_confidence"])

    def test_health_confirms_both_models_and_preserves_authentication(self):
        health = self.client.get("/api/health").get_json()
        self.assertEqual(health["model_version"], scanner.MODEL_VERSION)
        self.assertTrue(health["detector_ready"])
        self.assertTrue(health["classification_ready"])
        self.assertEqual(health["active_classifier"], "EfficientNet-B0")
        self.assertEqual(health["detector_artifact"], "bestv4.pt")
        self.assertEqual(health["detector_sha256"], DETECTOR_SHA256)
        self.assertEqual(health["detector_classes"], {"0": "item"})
        self.assertEqual(health["classifier_classes"], list(CLASSIFIER_CONDITIONS))
        self.assertEqual(health["image_versions"], ["original", "yolo_crops"])
        self.assertEqual(health["classifier_input"], "yolo-bounding-box-crops")
        self.assertEqual(health["classifier_confidence_threshold"], 0.35)
        self.assertEqual(health["yolo_confidence_threshold"], 0.65)
        self.assertEqual(self.client.post("/api/predict").status_code, 401)
        self.assertEqual(self.client.options("/api/predict").status_code, 204)

    def test_prediction_endpoint_upload_contract(self):
        with patch.object(scanner, "require_firebase_user", return_value=({"uid": "test"}, None)):
            self.assertEqual(self.client.post("/api/predict").status_code, 400)
            self.assertEqual(self.client.post("/api/predict", data={"image": (io.BytesIO(b""), "empty.jpg")}).status_code, 400)
            with patch.object(scanner, "yolo_model", return_value=[SimpleNamespace(boxes=[])]):
                response = self.client.post("/api/predict", data={"image": (io.BytesIO(self.blank), "photo.jpg")})
            self.assertEqual(response.status_code, 200)
            self.assertTrue(response.get_json()["classification_available"])
            self.assertIsNone(response.get_json()["top_confidence"])

    def test_corrupt_photo_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "Image could not be loaded"):
            scanner.run_pipeline(b"not an image")


if __name__ == "__main__":
    unittest.main()
