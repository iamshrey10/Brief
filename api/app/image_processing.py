import io

import cv2
import numpy as np
import pillow_heif
import pytesseract
from PIL import Image

pillow_heif.register_heif_opener()

# Below this average word confidence (0-100, tesseract's own scale), the scan is treated
# as too unreliable to trust and the document is flagged for a retake instead of "ready".
OCR_CONFIDENCE_THRESHOLD = 60.0

# A real photo of a page is at most a few degrees off; anything the angle heuristic
# reports beyond this almost always means it latched onto noise, not real skew, so it's
# safer to leave the image alone than to "correct" it based on a bad estimate.
MAX_DESKEW_ANGLE_DEGREES = 15.0

# Below this many detected foreground pixels, there isn't enough of a text mass to
# reliably estimate an angle from at all, most likely candidates are a mostly-blank
# region or Otsu thresholding away nearly all of a small, high-contrast line of text.
MIN_DESKEW_PIXELS = 200


def _deskew(gray: np.ndarray) -> np.ndarray:
    """Straightens a photo taken at a slight angle, using the angle of its text mass."""
    inverted = cv2.bitwise_not(gray)
    threshold = cv2.threshold(inverted, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)[1]
    coordinates = cv2.findNonZero(threshold)
    if coordinates is None or len(coordinates) < MIN_DESKEW_PIXELS:
        return gray

    (_cx, _cy), (rect_width, rect_height), raw_angle = cv2.minAreaRect(coordinates)

    # minAreaRect's angle is only meaningful relative to which side it treats as
    # "width". Normalizing against the longer side (the text baseline is almost always
    # the long axis) is more robust than the common "if angle < -45" snippet, which
    # misfires on a text mass that's much wider than it is tall, exactly our case.
    angle = raw_angle - 90 if rect_width < rect_height else raw_angle

    if abs(angle) < 0.1 or abs(angle) > MAX_DESKEW_ANGLE_DEGREES:
        return gray

    height, width = gray.shape
    center = (width // 2, height // 2)
    rotation_matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
    return cv2.warpAffine(
        gray, rotation_matrix, (width, height), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE
    )


def enhance_for_ocr(image_bytes: bytes) -> np.ndarray:
    """Runs a scanned or photographed page through a basic quality pipeline before OCR.

    Deliberately not attempting true deblurring or resolution upscaling, that's a research
    problem, not a sprint feature. This is detection-and-enhancement of an already-legible
    photo: straighten it, reduce noise, even out lighting, and binarize it, the same way
    any document scanner app would.
    """
    pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    bgr = cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)

    straightened = _deskew(gray)
    denoised = cv2.fastNlMeansDenoising(straightened, h=10)

    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    contrast_boosted = clahe.apply(denoised)

    binarized = cv2.adaptiveThreshold(
        contrast_boosted,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        blockSize=31,
        C=15,
    )
    return binarized


def ocr_image(image_bytes: bytes) -> tuple[str, float]:
    """Extracts text from one photographed or scanned page, with a confidence score.

    Returns (text, average_word_confidence). Confidence is tesseract's own 0-100 scale,
    averaged over words it was actually confident enough to report (it returns -1 for
    non-text regions, those are excluded rather than dragging the average down unfairly).
    """
    enhanced = enhance_for_ocr(image_bytes)
    data = pytesseract.image_to_data(enhanced, output_type=pytesseract.Output.DICT)

    words = []
    confidences = []
    for text, confidence in zip(data["text"], data["conf"], strict=True):
        stripped = text.strip()
        if not stripped:
            continue
        words.append(stripped)
        if int(confidence) >= 0:
            confidences.append(int(confidence))

    full_text = " ".join(words)
    average_confidence = sum(confidences) / len(confidences) if confidences else 0.0
    return full_text, average_confidence
