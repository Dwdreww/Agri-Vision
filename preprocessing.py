import cv2
import numpy as np


# These labels are returned by the backend and printed by test_pipe.py.
# They match the numbered code sections inside preprocess_pineapple_image().
PREPROCESSING_STEPS = [
    {
        "order": 1,
        "name": "Grayscale Conversion",
        "used_for": "Converts the image to brightness values so texture, shadows, and dark disease marks can be studied without color distraction."
    },
    {
        "order": 2,
        "name": "Gaussian Blur / Noise Reduction",
        "used_for": "Smooths tiny camera noise before segmentation so small random pixels are not mistaken as symptoms."
    },
    {
        "order": 3,
        "name": "CLAHE Contrast Enhancement",
        "used_for": "Improves local contrast so disease discoloration, pineapple edges, and leaf texture are more visible."
    },
    {
        "order": 4,
        "name": "HSV Image Segmentation",
        "used_for": "Creates an initial color mask for pineapple leaves, fruit skin, brown areas, and dark symptom regions."
    },
    {
        "order": 5,
        "name": "GrabCut Foreground Refinement",
        "used_for": "Uses image edges and color models to separate the central pineapple from similar green field background."
    },
    {
        "order": 6,
        "name": "Morphological Noise Cleanup",
        "used_for": "Removes small false mask pixels and fills small gaps in the segmented pineapple region."
    },
    {
        "order": 7,
        "name": "Foreground-Focused Model Input",
        "used_for": "Keeps the pineapple region sharp while softening background detail before YOLO detection."
    },
    {
        "order": 8,
        "name": "Dark Spot Candidate Mask",
        "used_for": "Highlights possible brown or black symptom areas for visual explanation of disease cues."
    }
]


def _mask_coverage(mask):
    return float(np.count_nonzero(mask)) / float(mask.size)


def _clean_binary_mask(mask, kernel_size):
    kernel = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE,
        (kernel_size, kernel_size)
    )

    cleaned = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    cleaned = cv2.morphologyEx(cleaned, cv2.MORPH_CLOSE, kernel)

    return cleaned


def _grabcut_foreground_mask(image_bgr):
    height, width = image_bgr.shape[:2]

    # The object is normally near the center of a crop sample photo.
    # The rectangle gives GrabCut a safe first guess of where foreground lives.
    margin_x = max(1, int(width * 0.04))
    margin_y = max(1, int(height * 0.04))
    grabcut_rect = (
        margin_x,
        margin_y,
        max(1, width - (margin_x * 2)),
        max(1, height - (margin_y * 2))
    )

    grabcut_mask = np.zeros((height, width), dtype=np.uint8)
    background_model = np.zeros((1, 65), dtype=np.float64)
    foreground_model = np.zeros((1, 65), dtype=np.float64)

    cv2.grabCut(
        image_bgr,
        grabcut_mask,
        grabcut_rect,
        background_model,
        foreground_model,
        3,
        cv2.GC_INIT_WITH_RECT
    )

    return np.where(
        (grabcut_mask == cv2.GC_FGD) | (grabcut_mask == cv2.GC_PR_FGD),
        255,
        0
    ).astype(np.uint8)


def preprocess_pineapple_image(image_bgr):
    """
    Build an explainable computer vision preprocessing pipeline for pineapple
    disease detection. The returned model_input has the same width and height
    as the original image, so YOLO boxes still line up with the original photo.
    """
    if image_bgr is None or image_bgr.size == 0:
        raise ValueError("Cannot preprocess an empty image.")

    original_bgr = image_bgr.copy()

    # =========================
    # PRE-PROCESSING 1: GRAYSCALE CONVERSION
    # Used for: removes color and keeps brightness/texture information.
    # This helps explain dark rot spots, uneven leaf texture, and shadows.
    # =========================
    grayscale = cv2.cvtColor(original_bgr, cv2.COLOR_BGR2GRAY)

    # =========================
    # PRE-PROCESSING 2: GAUSSIAN BLUR / NOISE REDUCTION
    # Used for: smooths small pixel noise before thresholding or segmentation.
    # The 5x5 kernel is gentle, so disease shape is preserved.
    # =========================
    noise_reduced_gray = cv2.GaussianBlur(grayscale, (5, 5), 0)

    # =========================
    # PRE-PROCESSING 3: CLAHE CONTRAST ENHANCEMENT
    # Used for: improves local contrast under uneven lighting.
    # LAB color space lets us enhance brightness without changing color too much.
    # =========================
    lab_image = cv2.cvtColor(original_bgr, cv2.COLOR_BGR2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab_image)

    # CLAHE means Contrast Limited Adaptive Histogram Equalization.
    # It makes subtle disease discoloration easier to see in bright/dark regions.
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced_l_channel = clahe.apply(l_channel)

    contrast_enhanced_bgr = cv2.cvtColor(
        cv2.merge((enhanced_l_channel, a_channel, b_channel)),
        cv2.COLOR_LAB2BGR
    )

    # =========================
    # PRE-PROCESSING 4: HSV IMAGE SEGMENTATION
    # Used for: builds an initial color mask from likely plant/disease colors.
    # HSV is useful because hue/saturation separate color from brightness.
    # =========================
    hsv_image = cv2.cvtColor(contrast_enhanced_bgr, cv2.COLOR_BGR2HSV)

    # Green range: pineapple leaves/crown.
    green_mask = cv2.inRange(
        hsv_image,
        np.array([25, 35, 35], dtype=np.uint8),
        np.array([95, 255, 255], dtype=np.uint8)
    )

    # Yellow/brown range: pineapple fruit skin and many rot/discoloration areas.
    yellow_brown_mask = cv2.inRange(
        hsv_image,
        np.array([5, 35, 30], dtype=np.uint8),
        np.array([35, 255, 255], dtype=np.uint8)
    )

    # Low-saturation dark range: possible black/brown disease spots.
    dark_symptom_mask = cv2.inRange(
        hsv_image,
        np.array([0, 15, 0], dtype=np.uint8),
        np.array([179, 255, 105], dtype=np.uint8)
    )

    foreground_mask = cv2.bitwise_or(green_mask, yellow_brown_mask)
    foreground_mask = cv2.bitwise_or(foreground_mask, dark_symptom_mask)

    # =========================
    # PRE-PROCESSING 5: GRABCUT FOREGROUND REFINEMENT
    # Used for: separates the central pineapple from field background.
    # This helps when grass and pineapple leaves share similar green colors.
    # =========================
    try:
        grabcut_mask = _grabcut_foreground_mask(contrast_enhanced_bgr)

        refined_foreground_mask = cv2.bitwise_and(
            grabcut_mask,
            foreground_mask
        )

        # If the color and GrabCut masks disagree too much, trust GrabCut.
        if _mask_coverage(refined_foreground_mask) < 0.02:
            foreground_mask = grabcut_mask
        else:
            foreground_mask = refined_foreground_mask
    except cv2.error:
        grabcut_mask = foreground_mask.copy()

    # =========================
    # PRE-PROCESSING 6: MORPHOLOGICAL NOISE CLEANUP
    # Used for: removes isolated dots and closes small holes in the mask.
    # Opening removes noise; closing reconnects nearby pineapple regions.
    # =========================
    cleaned_foreground_mask = _clean_binary_mask(foreground_mask, kernel_size=7)

    mask_coverage = _mask_coverage(cleaned_foreground_mask)
    segmentation_used_fallback = False

    # If lighting makes the color mask too tiny, keep the full image available.
    # This prevents preprocessing from hiding the pineapple from YOLO.
    if mask_coverage < 0.02:
        cleaned_foreground_mask = np.full_like(cleaned_foreground_mask, 255)
        mask_coverage = 1.0
        segmentation_used_fallback = True

    segmented_bgr = cv2.bitwise_and(
        contrast_enhanced_bgr,
        contrast_enhanced_bgr,
        mask=cleaned_foreground_mask
    )

    # =========================
    # PRE-PROCESSING 7: FOREGROUND-FOCUSED MODEL INPUT
    # Used for: keeps the pineapple sharp and softens distracting background.
    # This prepares a cleaner image for YOLO while preserving original size.
    # =========================
    background_softened_bgr = cv2.GaussianBlur(contrast_enhanced_bgr, (21, 21), 0)
    foreground_selector = cleaned_foreground_mask[:, :, None] > 0

    model_input = np.where(
        foreground_selector,
        contrast_enhanced_bgr,
        background_softened_bgr
    ).astype(np.uint8)

    # =========================
    # PRE-PROCESSING 8: DARK SPOT CANDIDATE MASK
    # Used for: visual explanation of possible disease cues.
    # This mask is not a final diagnosis; the trained model still decides class.
    # =========================
    dark_spot_candidate_mask = cv2.bitwise_and(
        dark_symptom_mask,
        cleaned_foreground_mask
    )
    dark_spot_candidate_mask = _clean_binary_mask(
        dark_spot_candidate_mask,
        kernel_size=5
    )

    dark_spot_coverage = _mask_coverage(dark_spot_candidate_mask)

    return {
        "original": original_bgr,
        "grayscale": grayscale,
        "noise_reduced_gray": noise_reduced_gray,
        "contrast_enhanced": contrast_enhanced_bgr,
        "grabcut_mask": grabcut_mask,
        "segmentation_mask": cleaned_foreground_mask,
        "segmented_image": segmented_bgr,
        "model_input": model_input,
        "dark_spot_candidate_mask": dark_spot_candidate_mask,
        "steps": PREPROCESSING_STEPS,
        "mask_coverage_percent": round(mask_coverage * 100, 1),
        "dark_spot_coverage_percent": round(dark_spot_coverage * 100, 1),
        "segmentation_used_fallback": segmentation_used_fallback
    }
