"""Shrinks the flat colour diagrams inside a built PDF by storing them as 256 colour indexed images instead of full colour.
Text and layout are untouched. Usage: compact_pdf.py file.pdf"""
import sys

import pymupdf
from PIL import Image

path = sys.argv[1]
doc = pymupdf.open(path)
changed = 0
for xref in range(1, doc.xref_length()):
    try:
        if doc.xref_get_key(xref, "Subtype")[1] != "/Image":
            continue
        w = int(doc.xref_get_key(xref, "Width")[1])
        h = int(doc.xref_get_key(xref, "Height")[1])
        if w < 1000 or doc.xref_get_key(xref, "BitsPerComponent")[1] != "8":
            continue
        pix = pymupdf.Pixmap(doc, xref)
    except Exception:
        continue
    if pix.n != 3:
        continue
    img = Image.frombytes("RGB", (w, h), pix.samples).quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    pal = bytes(img.getpalette()[:768]).ljust(768, b"\0")
    doc.update_stream(xref, img.tobytes(), compress=True)
    doc.xref_set_key(xref, "ColorSpace", "[/Indexed /DeviceRGB 255 <" + pal.hex() + ">]")
    changed += 1
doc.save(path + ".tmp", garbage=4, deflate=True)
doc.close()
import os
os.replace(path + ".tmp", path)
print(f"compacted {changed} image(s): {path}")
