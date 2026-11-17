"""Checks a built PDF the way a reader would: it opens, it has selectable text, the font is Times New Roman, no em dash, no page is nearly empty,
and nothing runs past the page edge. Also writes a contact sheet so the pages can be looked at. Usage: check_pdf.py file.pdf sheet.png"""
import sys

import pymupdf
from PIL import Image

path, sheet = sys.argv[1], sys.argv[2]
doc = pymupdf.open(path)
fonts = {f[3].split("+")[-1] for page in doc for f in page.get_fonts()}
text = "".join(page.get_text() for page in doc)
problems = []
if "\u2014" in text:
    problems.append("EM DASH FOUND")
if len(text.strip()) < 500:
    problems.append("very little selectable text")
if not any("TimesNewRoman" in f for f in fonts):
    problems.append("no Times New Roman")
for i, page in enumerate(doc, start=1):
    words = len(page.get_text().split())
    blocks = page.get_text("blocks")
    rect = page.rect
    if i > 2 and words < 25 and not page.get_images():
        problems.append(f"page {i} is almost empty ({words} words)")
    for b in blocks:
        if b[2] > rect.width + 1 or b[3] > rect.height + 1 or b[0] < -1:
            problems.append(f"page {i}: text past the edge")
            break
print(f"{path.split('/')[-1]}: {doc.page_count} pages, {len(text.split())} words, fonts: {sorted(f for f in fonts if 'Times' in f or 'Courier' in f)}")
print("  problems:", problems or "none")
ims = []
for page in doc:
    pix = page.get_pixmap(dpi=45)
    img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    ims.append(img)
cols = 6
w = max(i.width for i in ims)
h = max(i.height for i in ims)
rows = (len(ims) + cols - 1) // cols
sh = Image.new("RGB", (cols * (w + 10), rows * (h + 10)), "#888")
for k, im in enumerate(ims):
    sh.paste(im, ((k % cols) * (w + 10), (k // cols) * (h + 10)))
sh.save(sheet)
