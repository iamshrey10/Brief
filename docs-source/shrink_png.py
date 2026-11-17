"""Makes a copy of a diagram for embedding in a PDF: 1800 pixels wide and a 256 colour palette. The diagrams are flat colour and text,
so this is hard to tell from the original, and it keeps each PDF under the repository's file size limit. Usage: shrink_png.py in.png out.png"""
import sys

from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
img = Image.open(src).convert("RGB")
if img.width > 1800:
    img = img.resize((1800, round(img.height * 1800 / img.width)), Image.LANCZOS)
img.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(dst, optimize=True)
