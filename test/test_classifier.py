"""Verify the supplied classifier without assigning unconfirmed output labels."""
import unittest
import json
import tempfile
from pathlib import Path
from unittest.mock import patch

import torch
from PIL import Image

from scanner_models import (
    CLASSIFIER_ARTIFACT,
    CLASSIFIER_OUTPUT_COUNT,
    CLASSIFIER_SHA256,
    classifier_transform,
    file_sha256,
    load_classifier,
    load_classifier_labels,
    CLASSIFIER_LABELS,
)

ROOT = Path(__file__).resolve().parents[1]
CHECKPOINT = ROOT / "models" / CLASSIFIER_ARTIFACT


class ClassifierTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.model = load_classifier(CHECKPOINT)

    def test_supplied_weights_match_the_training_head_and_use_eval_mode(self):
        self.assertEqual(file_sha256(CHECKPOINT), CLASSIFIER_SHA256)
        self.assertFalse(self.model.training)
        self.assertEqual(self.model.classifier[0].p, 0.2)
        self.assertEqual(self.model.classifier[1][0].p, 0.3)
        self.assertEqual(self.model.classifier[1][1].in_features, 1280)
        self.assertEqual(self.model.classifier[1][1].out_features, CLASSIFIER_OUTPUT_COUNT)
        self.assertTrue(all(not layer.training for layer in self.model.modules()))

    def test_cpu_inference_produces_four_finite_unnamed_scores(self):
        with Image.open(ROOT / "pineappletest.png") as image:
            inputs = classifier_transform()(image.convert("RGB")).unsqueeze(0)
        with torch.inference_mode():
            logits = self.model(inputs)
            probabilities = torch.softmax(logits, dim=1)
        self.assertEqual(tuple(logits.shape), (1, 4))
        self.assertTrue(torch.isfinite(logits).all().item())
        self.assertTrue(torch.isfinite(probabilities).all().item())
        self.assertAlmostEqual(probabilities.sum().item(), 1.0, places=6)

    def test_validation_transform_preserves_rgb_channel_order_and_normalization(self):
        image = Image.new("RGB", (224, 224), (255, 0, 128))
        actual = classifier_transform()(image)
        self.assertEqual(tuple(actual.shape), (3, 224, 224))
        expected = torch.tensor([
            (1.0 - 0.485) / 0.229,
            (0.0 - 0.456) / 0.224,
            (128 / 255 - 0.406) / 0.225,
        ])
        torch.testing.assert_close(actual, expected[:, None, None].expand_as(actual))

    def test_validation_transform_centers_rectangular_crops_with_black_padding(self):
        prepare = classifier_transform()
        expected_color = prepare(Image.new("RGB", (224, 224), (255, 0, 128)))[:, 0, 0]
        expected_black = prepare(Image.new("RGB", (224, 224)))[:, 0, 0]
        for size in [(224, 101), (101, 224)]:
            with self.subTest(size=size):
                actual = prepare(Image.new("RGB", size, (255, 0, 128)))
                if size[0] < size[1]:
                    actual = actual.transpose(1, 2)
                for band, color in [
                    (actual[:, :61], expected_black),
                    (actual[:, 61:162], expected_color),
                    (actual[:, 162:], expected_black),
                ]:
                    torch.testing.assert_close(band, color[:, None, None].expand_as(band))

    def test_replacement_checkpoint_requires_review(self):
        with patch("scanner_models.file_sha256", return_value="different"):
            with self.assertRaisesRegex(ValueError, "Classifier checksum mismatch"):
                load_classifier(CHECKPOINT)

    def test_metrics_confirm_the_output_order_and_reject_swapped_or_missing_labels(self):
        metadata = ROOT / "models/efficientnet_metrics.json"
        self.assertEqual(load_classifier_labels(metadata), CLASSIFIER_LABELS)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "metrics.json"
            for labels in [("fruit_rot", "fruit_fasciation", "No_Disease", "mutli_crown"), CLASSIFIER_LABELS[:3]]:
                path.write_text(json.dumps({"class_indices": dict(enumerate(labels))}))
                with self.assertRaises(ValueError):
                    load_classifier_labels(path)


if __name__ == "__main__":
    unittest.main()
