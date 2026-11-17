"""Finds the page of each numbered heading in a rendered PDF, so the contents page can show page numbers.
Reads headings by their font size (a section heading is larger than body text), in order, so a heading's words
appearing in a paragraph cannot be mistaken for it. Usage: find_pages.py file.pdf headings.json"""
import json
import sys

import pymupdf

pdf, headings_file = sys.argv[1], sys.argv[2]
headings = json.load(open(headings_file))
doc = pymupdf.open(pdf)
found = {}
pointer = 0
for page_index in range(1, doc.page_count):
    spans = []
    for block in doc[page_index].get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            text = "".join(span["text"] for span in line["spans"]).strip()
            size = max((span["size"] for span in line["spans"]), default=0)
            spans.append((text, size))
    for text, size in spans:
        if pointer < len(headings) and size >= 12.4:
            wanted = headings[pointer]
            if text.endswith(wanted["title"]) or text == wanted["title"]:
                found[wanted["id"]] = page_index + 1
                pointer += 1
json.dump(found, sys.stdout)
