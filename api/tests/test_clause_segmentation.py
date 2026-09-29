from app.clause_segmentation import CHUNK_SIZE_CHARS, chunk_page_text, segment_page_into_clauses


def test_segment_detects_numbered_clauses():
    text = (
        "1. The Borrower shall repay the loan in full.\n"
        "2. Interest accrues at six percent annually.\n"
        "3. Late payments incur a twenty five dollar fee.\n"
    )

    segments = segment_page_into_clauses(text)

    assert len(segments) == 3
    assert segments[0][2].startswith("1. The Borrower")
    assert segments[1][2].startswith("2. Interest")
    assert segments[2][2].startswith("3. Late payments")


def test_segment_detects_section_style_numbering():
    text = (
        "Section 1. Definitions apply throughout this agreement.\n"
        "Section 2. The term of this lease is twelve months.\n"
    )

    segments = segment_page_into_clauses(text)

    assert len(segments) == 2
    assert "Definitions" in segments[0][2]
    assert "term of this lease" in segments[1][2]


def test_segment_detects_lettered_subclauses():
    text = (
        "(a) The tenant shall pay rent on the first of each month.\n"
        "(b) A late fee applies after the fifth day.\n"
        "(c) Partial payments are not accepted.\n"
    )

    segments = segment_page_into_clauses(text)

    assert len(segments) == 3
    assert segments[0][2].startswith("(a)")
    assert segments[2][2].startswith("(c)")


def test_segment_falls_back_to_naive_chunking_for_unstructured_prose():
    text = "This is a long paragraph of ordinary prose with no numbering at all. " * 40

    assert segment_page_into_clauses(text) == chunk_page_text(text)


def test_segment_falls_back_when_only_one_boundary_found():
    text = "Some intro text with no structure.\n1. Only one numbered item appears here."

    # one match alone isn't enough evidence the whole page is really numbered
    assert segment_page_into_clauses(text) == chunk_page_text(text)


def test_segment_resplits_an_implausibly_long_detected_clause():
    long_body = "Filler sentence about the terms of the agreement. " * 100
    text = f"1. {long_body}\n2. A short second clause."

    segments = segment_page_into_clauses(text)

    # the oversized "1." clause should have been broken up, not kept as one giant blob
    assert len(segments) > 2
    assert all(len(seg_text) <= CHUNK_SIZE_CHARS for *_span, seg_text in segments[:-1])
    assert segments[-1][2].startswith("2. A short second clause")


def test_segment_covers_every_character_of_the_original_text_in_order():
    text = "1. First clause here.\n2. Second clause here.\n3. Third clause here.\n"

    segments = segment_page_into_clauses(text)

    for current, following in zip(segments, segments[1:]):
        assert current[1] == following[0]
    assert segments[0][0] == 0
    assert segments[-1][1] == len(text)
