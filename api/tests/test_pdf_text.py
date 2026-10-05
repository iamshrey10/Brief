import re

import pymupdf
import pytest

from app.clause_segmentation import segment_page_into_clauses
from app.ingestion import extract_pages
from app.pdf_text import letters_of, looks_like_columns, page_text, tidy


@pytest.fixture
def one_page():
    """Builds a one page PDF by calling `draw(page)`, and closes every document afterwards."""
    documents: list[pymupdf.Document] = []

    def build(draw) -> pymupdf.Page:
        document = pymupdf.open()
        documents.append(document)
        page = document.new_page()
        draw(page)
        return page

    yield build

    for document in documents:
        document.close()


def _squash(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


# --- a form filled in on top of a template: every value is drawn after all the labels ---


def _filled_form(page):
    for x, label in ((72, "UNIT #:"), (200, "BLDG #:"), (330, "LEASE BEGIN DATE:")):
        page.insert_text((x, 100), label, fontsize=10)
    for x, value in ((112, "2039"), (245, "1"), (430, "AUGUST 7, 2025")):
        page.insert_text((x, 100), value, fontsize=10)


def test_the_stored_order_of_a_filled_form_really_does_separate_labels_from_values(one_page):
    page = one_page(_filled_form)

    # The premise of everything below: without help, "UNIT #:" and "2039" are not together.
    assert "UNIT #: 2039" not in _squash(page.get_text())


def test_a_filled_form_keeps_each_label_with_its_value(one_page):
    page = one_page(_filled_form)

    text = _squash(page_text(page))

    assert "UNIT #: 2039" in text
    assert "BLDG #: 1" in text
    assert "LEASE BEGIN DATE: AUGUST 7, 2025" in text


# --- a table drawn column by column comes out one cell per line ---


def _table(page):
    columns = {
        72: ["Course", "CSE 579", "CSE 575", "CSE 512"],
        200: ["Credits", "3.000", "3.000", "3.000"],
        300: ["Grade", "B", "A", "A-"],
    }
    for x, cells in columns.items():
        for row, cell in enumerate(cells):
            page.insert_text((x, 100 + row * 11), cell, fontsize=10)


def test_a_table_is_read_row_by_row_not_cell_by_cell(one_page):
    page = one_page(_table)

    default_lines = [line.strip() for line in page.get_text().splitlines() if line.strip()]
    assert "CSE 579 3.000 B" not in default_lines  # premise: the stored order is column by column

    lines = [_squash(line) for line in page_text(page).splitlines() if line.strip()]
    assert "Course Credits Grade" in lines
    assert "CSE 579 3.000 B" in lines
    assert "CSE 575 3.000 A" in lines
    assert "CSE 512 3.000 A-" in lines


# --- two columns of running text must not be read straight across ---

LEFT = "The borrower shall repay the loan in equal monthly installments and interest accrues daily."
RIGHT = "The borrower may prepay all or part of the loan at any time without any penalty or fee."


def _two_columns(page):
    y = 80
    for index in range(1, 5):
        page.insert_textbox(
            pymupdf.Rect(60, y, 280, y + 80), f"LEFT-{index} " + " ".join([LEFT] * 2), fontsize=10
        )
        page.insert_textbox(
            pymupdf.Rect(320, y + 6, 540, y + 86), f"RIGHT-{index} " + " ".join([RIGHT] * 2), fontsize=10
        )
        y += 100


def test_reading_two_columns_straight_across_would_interleave_their_lines(one_page):
    page = one_page(_two_columns)

    # The premise: sorting by position, which is what helps a form, wrecks a column page.
    right_paragraph = f"RIGHT-1 {RIGHT} {RIGHT}"
    assert right_paragraph not in _squash(page.get_text(sort=True))


def test_a_page_of_two_columns_is_recognised(one_page):
    assert looks_like_columns(one_page(_two_columns)) is True


def test_a_page_of_two_columns_keeps_each_paragraph_whole(one_page):
    page = one_page(_two_columns)

    text = _squash(page_text(page))

    for index in range(1, 5):
        assert f"LEFT-{index} {LEFT} {LEFT}" in text
        assert f"RIGHT-{index} {RIGHT} {RIGHT}" in text


def test_a_single_column_of_text_is_not_mistaken_for_columns(one_page):
    def single(page):
        for index in range(4):
            page.insert_textbox(
                pymupdf.Rect(60, 80 + index * 100, 540, 170 + index * 100),
                f"{index + 1}. " + " ".join([LEFT] * 3),
                fontsize=10,
            )

    assert looks_like_columns(one_page(single)) is False


def _signature_blocks(page):
    # Several short lines packed tightly, side by side: tall in lines but only a few points high.
    for x in (60, 320):
        for index, text in enumerate(["(Resident)", "Date", "A Name Here Smith", "07/2025"]):
            page.insert_text((x, 600 + index * 4), text, fontsize=5)


def test_signature_blocks_side_by_side_are_not_mistaken_for_columns(one_page):
    page = one_page(_signature_blocks)

    # Premise: they really are side by side blocks of several lines, so only the height and line
    # length rules keep them from being called columns.
    several_line_blocks = [b for b in page.get_text("blocks") if b[6] == 0 and b[4].strip().count("\n") >= 2]
    assert len(several_line_blocks) == 2
    assert looks_like_columns(page) is False


def _long_signature_lines(page):
    # E-signature stamps: long lines, several to a block, but packed into a few points of height.
    for x in (36, 288):
        for index, text in enumerate(
            ["***SIGN HERE*** { Name Here Smith } {}", "Signed by Name Here Smith", "Wed Feb 25 2026 12:20:19"]
        ):
            page.insert_text((x, 556 + index * 4), text, fontsize=5)


def test_long_signature_lines_packed_tightly_are_not_mistaken_for_columns(one_page):
    page = one_page(_long_signature_lines)

    blocks = [b for b in page.get_text("blocks") if b[6] == 0]
    # Premise: each block has several lines of 25 or more characters, so only its small height
    # keeps it from looking like running text. This is what a real e-signed lease looks like.
    assert len(blocks) == 2
    assert all(len(b[4].strip()) / (b[4].strip().count("\n") + 1) >= 25 for b in blocks)
    assert looks_like_columns(page) is False


def test_a_filled_form_is_not_mistaken_for_columns(one_page):
    assert looks_like_columns(one_page(_filled_form)) is False


def test_a_table_is_not_mistaken_for_columns(one_page):
    assert looks_like_columns(one_page(_table)) is False


# --- reading in a better order must never lose or add a word ---


@pytest.mark.parametrize("draw", [_filled_form, _table, _two_columns])
def test_reordering_never_loses_or_adds_any_text(one_page, draw):
    page = one_page(draw)

    assert letters_of(page_text(page)) == letters_of(page.get_text())


def _padded(page):
    page.insert_text((72, 60), "The Hyve", fontsize=10)
    page.insert_text((250, 160), "APARTMENT DEPOSIT AGREEMENT", fontsize=12)
    page.insert_text((72, 400), "1. First clause text goes here and is long enough to matter.", fontsize=10)


def _indented_clauses(page):
    page.insert_text((72, 60), "DEPOSIT AGREEMENT", fontsize=12)  # the left margin the indents are measured from
    for index, word in enumerate(["First", "Second", "Third"]):
        page.insert_text(
            (150, 100 + index * 40),
            f"{index + 1}. {word} clause text goes here and is long enough to be a clause.",
            fontsize=10,
        )


def test_position_sorted_text_really_does_carry_padding(one_page):
    raw = one_page(_padded).get_text(sort=True)

    # Premise: without tidying there are runs of blank lines and an indent.
    assert "\n\n\n" in raw
    assert re.search(r"\n[ ]{4,}\S", raw)


def test_a_padded_page_comes_back_tidy(one_page):
    text = page_text(one_page(_padded))

    assert "\n\n\n" not in text
    assert not re.search(r"\n[ \t]+\S", text)
    assert text == text.strip()
    assert "APARTMENT DEPOSIT AGREEMENT" in text


def test_indented_clause_numbers_are_still_found_as_separate_clauses(one_page):
    page = one_page(_indented_clauses)

    # Premise: left as it comes, the indents hide the numbering from the clause detection.
    assert len(segment_page_into_clauses(page.get_text(sort=True))) < 3

    clauses = segment_page_into_clauses(page_text(page))
    numbered = [text[:2] for _start, _end, text in clauses if text[0].isdigit()]
    assert numbered == ["1.", "2.", "3."]


@pytest.mark.parametrize("draw", [_filled_form, _table])
def test_text_read_by_position_comes_back_tidy(one_page, draw):
    text = page_text(one_page(draw))

    assert "\n\n\n" not in text
    assert not re.search(r"\n[ \t]+\S", text), "a line starts with indent padding"
    assert not re.search(r"[ \t]\n", text), "a line ends with trailing spaces"
    assert text == text.strip()


# --- tidy removes padding, not words ---


def test_tidy_collapses_runs_of_blank_lines_and_indents():
    messy = "First line   \n\n\n\n        PARKING AGREEMENT\n\n\n   Name:     Casey  \n"

    assert tidy(messy) == "First line\n\nPARKING AGREEMENT\n\nName: Casey"


def test_tidy_keeps_a_clause_number_at_the_start_of_its_line():
    # Indents hid clause numbers from the clause detection before they were removed.
    assert tidy("intro\n\n          1. The first clause.\n          2. The second.") == (
        "intro\n\n1. The first clause.\n2. The second."
    )


def test_tidy_never_changes_a_word():
    text = "Rent  is\n\n\n\n $2,054.00 ,  due   monthly."

    assert letters_of(tidy(text)) == letters_of(text)


def test_tidy_of_nothing_is_nothing():
    assert tidy("") == ""
    assert tidy("   \n\n  ") == ""


# --- ingestion reads PDFs this way ---


def test_extract_pages_returns_filled_form_values_beside_their_labels():
    document = pymupdf.open()
    _filled_form(document.new_page())

    pages, confidence = extract_pages(document.tobytes(), "application/pdf")

    assert confidence is None
    assert "UNIT #: 2039" in _squash(pages[0])


def test_extract_pages_keeps_a_two_column_page_in_its_stored_order():
    document = pymupdf.open()
    _two_columns(document.new_page())

    pages, _ = extract_pages(document.tobytes(), "application/pdf")

    assert f"RIGHT-2 {RIGHT} {RIGHT}" in _squash(pages[0])
