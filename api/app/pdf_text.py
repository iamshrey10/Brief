import re
from collections import Counter

import pymupdf

# A block counts as running text, a paragraph in a column, only when it is several lines, tall
# enough to really be several lines, and made of long lines. Signature blocks and the cells of a
# table can be several short pieces at the same height, and sit side by side too, but they are
# not columns, and reading across them is exactly what keeps a table row or a form field together.
MIN_COLUMN_LINES = 3
MIN_COLUMN_HEIGHT_POINTS = 30
MIN_COLUMN_CHARS_PER_LINE = 25

# Two blocks sit in different columns when they share this much of their height, and are at
# least this many points apart horizontally.
MIN_VERTICAL_OVERLAP = 0.5
MIN_COLUMN_GAP_POINTS = 10


def _is_running_text(block: tuple) -> bool:
    text = block[4].strip()
    lines = text.count("\n") + 1
    return (
        lines >= MIN_COLUMN_LINES
        and block[3] - block[1] >= MIN_COLUMN_HEIGHT_POINTS
        and len(text) / lines >= MIN_COLUMN_CHARS_PER_LINE
    )


def looks_like_columns(page: pymupdf.Page) -> bool:
    """True when the page has running text laid out side by side, as in a two column contract.

    Sorting a page's text by position reads straight across the page, which interleaves the
    lines of two columns. A filled in form is the opposite case: its labels and values are single
    lines side by side, and reading across is exactly what keeps them together. So only paragraphs
    of running text count, and only when they sit next to each other, not one above the other."""
    blocks = [block for block in page.get_text("blocks") if block[6] == 0 and _is_running_text(block)]
    for index, first in enumerate(blocks):
        for second in blocks[index + 1 :]:
            separated = (
                second[0] - first[2] >= MIN_COLUMN_GAP_POINTS
                or first[0] - second[2] >= MIN_COLUMN_GAP_POINTS
            )
            overlap = min(first[3], second[3]) - max(first[1], second[1])
            shorter = min(first[3] - first[1], second[3] - second[1])
            if separated and shorter > 0 and overlap / shorter >= MIN_VERTICAL_OVERLAP:
                return True
    return False


def tidy(text: str) -> str:
    """Removes the padding that position-sorted text carries, runs of blank lines and the
    indents that stand in for horizontal position, without touching any words. Left in, the
    indents hide clause numbers from the clause detection."""
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n[ \t]+", "\n", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def page_text(page: pymupdf.Page) -> str:
    """The text of a PDF page, in the order a person would read it.

    A PDF stores text in the order it was drawn, which is not always the order it appears. A form
    filled in on top of a template draws every value after all the labels, so "UNIT #:" and "2039"
    end up far apart, and a table's cells come out one per line. Reading by position puts them back
    together. A page with columns keeps its stored order, which already runs column by column."""
    if looks_like_columns(page):
        return page.get_text()
    return tidy(page.get_text(sort=True))


def letters_of(text: str) -> Counter:
    """Every non-space character in the text, counted. Two texts with the same letters hold the
    same words, however they are ordered or spaced."""
    return Counter(re.sub(r"\s+", "", text))
