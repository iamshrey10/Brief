import re

# The naive fallback's target chunk size, used when clause-aware segmentation can't be
# trusted, and to re-split a detected "clause" that turned out implausibly long.
CHUNK_SIZE_CHARS = 1500

# A single detected clause longer than this almost always means a missed boundary
# partway through, not one genuinely enormous clause, so it gets re-split.
MAX_CLAUSE_CHARS = 3000

# Below this many real numbering matches, there isn't enough evidence the document is
# actually structured this way, a single stray match could just be a coincidence.
MIN_CLAUSE_BOUNDARIES = 2

# Matches common contract clause numbering at the start of a line: "1. ", "1.1 ",
# "(a) ", "(iv) ", "A. ", "Section 2", "ARTICLE IV". Deliberately conservative, since a
# false match mid-sentence would wrongly split a clause in half.
CLAUSE_BOUNDARY_PATTERN = re.compile(
    r"^(?:"
    r"\d+(?:\.\d+)*\.?\s+"
    r"|\([a-zA-Z0-9]{1,4}\)\s+"
    r"|[A-Z]\.\s+"
    r"|(?:Section|SECTION|Article|ARTICLE)\s+[\dIVXLCivxlc]+\b"
    r")",
    re.MULTILINE,
)


def chunk_page_text(text: str) -> list[tuple[int, int, str]]:
    """Splits text into naive fixed-size chunks with soft boundaries, the fallback used
    when structure-aware clause detection doesn't find enough real numbering to trust.

    Returns a list of (char_start, char_end, chunk_text), offsets relative to `text`.
    """
    chunks: list[tuple[int, int, str]] = []
    start = 0
    length = len(text)

    while start < length:
        end = min(start + CHUNK_SIZE_CHARS, length)
        if end < length:
            boundary = text.rfind("\n\n", start, end)
            if boundary == -1 or boundary <= start:
                boundary = text.rfind(". ", start, end)
            if boundary != -1 and boundary > start:
                end = boundary + 1

        chunk_text = text[start:end].strip()
        if chunk_text:
            chunks.append((start, end, chunk_text))
        start = end

    return chunks


def segment_page_into_clauses(text: str) -> list[tuple[int, int, str]]:
    """Splits one page's text on real clause numbering (1., Section 2, (a), ...), so each
    retrieval unit is a self-contained clause instead of an arbitrary character slice.

    Falls back entirely to the naive fixed-size chunker when too few numbering patterns
    are found to trust the document is actually structured this way, and internally
    re-splits any single detected clause that's implausibly long, since one missed
    boundary can otherwise swallow the rest of the page into one giant "clause".
    """
    boundary_starts = sorted({match.start() for match in CLAUSE_BOUNDARY_PATTERN.finditer(text)})

    if len(boundary_starts) < MIN_CLAUSE_BOUNDARIES:
        return chunk_page_text(text)

    if boundary_starts[0] != 0:
        boundary_starts = [0] + boundary_starts

    ends = boundary_starts[1:] + [len(text)]

    segments: list[tuple[int, int, str]] = []
    for start, end in zip(boundary_starts, ends, strict=True):
        segment_text = text[start:end].strip()
        if not segment_text:
            continue

        if len(segment_text) <= MAX_CLAUSE_CHARS:
            segments.append((start, end, segment_text))
            continue

        for sub_start, sub_end, sub_text in chunk_page_text(text[start:end]):
            segments.append((start + sub_start, start + sub_end, sub_text))

    return segments
