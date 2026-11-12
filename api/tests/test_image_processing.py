import io

from PIL import Image, ImageDraw, ImageFont

from app.image_processing import OCR_CONFIDENCE_THRESHOLD, enhance_for_ocr, ocr_image


def _make_text_image(text: str, angle: float = 0) -> bytes:
    image = Image.new("RGB", (900, 250), color="white")
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default(size=48)
    draw.text((30, 90), text, fill="black", font=font)
    if angle:
        image = image.rotate(angle, fillcolor="white", expand=False)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def test_ocr_image_reads_real_text_from_a_clean_image():
    image_bytes = _make_text_image("Hello Brief")

    text, confidence = ocr_image(image_bytes)

    assert "Hello" in text
    assert "Brief" in text
    assert confidence > OCR_CONFIDENCE_THRESHOLD


def test_ocr_image_reads_text_from_a_slightly_rotated_photo():
    image_bytes = _make_text_image("Rotated Page", angle=4)

    text, confidence = ocr_image(image_bytes)

    assert "Rotated" in text or "Page" in text
    assert confidence > 0


def test_ocr_image_returns_no_text_and_zero_confidence_for_a_blank_image():
    blank = Image.new("RGB", (900, 250), color="white")
    buffer = io.BytesIO()
    blank.save(buffer, format="PNG")

    text, confidence = ocr_image(buffer.getvalue())

    assert text == ""
    assert confidence == 0.0


def test_enhance_for_ocr_returns_a_single_channel_image_same_size():
    image_bytes = _make_text_image("Size check")

    enhanced = enhance_for_ocr(image_bytes)

    assert enhanced.ndim == 2
    assert enhanced.shape == (250, 900)


def test_a_huge_photo_is_shrunk_before_it_is_read_so_it_cannot_exhaust_memory():
    from app.image_processing import MAX_OCR_SIDE_PIXELS

    image = Image.new("RGB", (6000, 4000), color="white")
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG")

    enhanced = enhance_for_ocr(buffer.getvalue())

    assert max(enhanced.shape) <= MAX_OCR_SIDE_PIXELS


def test_a_photo_stored_sideways_with_a_rotation_tag_is_read_upright():
    image = Image.new("RGB", (400, 200), color="white")
    exif = Image.Exif()
    exif[0x0112] = 6  # "turn a quarter clockwise to see it as it was held"
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", exif=exif)

    enhanced = enhance_for_ocr(buffer.getvalue())

    assert enhanced.shape == (400, 200)
