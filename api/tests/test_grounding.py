from app.grounding import normalize, numbers_in, numbers_supported, quote_appears_in

CLAUSE = (
    "The borrower may prepay all or part\nof the loan at any time   without penalty."
)


def test_normalize_collapses_whitespace_and_case():
    assert normalize("  Late\n Fee\t applies ") == "late fee applies"


def test_a_verbatim_quote_is_accepted():
    assert quote_appears_in("prepay all or part of the loan", CLAUSE)


def test_case_and_line_breaks_do_not_matter():
    assert quote_appears_in("AT ANY TIME without penalty", CLAUSE)


def test_surrounding_quotation_marks_are_ignored():
    assert quote_appears_in('"without penalty"', CLAUSE)
    assert quote_appears_in("'without penalty'", CLAUSE)


def test_a_reworded_quote_is_rejected():
    assert not quote_appears_in("may repay early with no fee", CLAUSE)


def test_one_changed_number_is_rejected():
    assert not quote_appears_in("five percent", "A late charge of ten percent applies.")


def test_an_empty_or_quotes_only_quote_is_rejected():
    assert not quote_appears_in("", CLAUSE)
    assert not quote_appears_in('  ""  ', CLAUSE)


def test_numbers_in_finds_every_figure_and_ignores_thousands_separators():
    assert numbers_in("Rent is $2,054.00 due on the 5th, late fee $50") == {"2054.00", "5", "50"}


def test_numbers_in_text_with_no_figures_is_empty():
    assert numbers_in("six months after graduation") == set()


def test_a_value_with_no_figures_is_always_supported():
    assert numbers_supported("paid monthly", ["any quote at all"])
    assert numbers_supported("paid monthly", [])


def test_every_figure_must_be_in_the_quote():
    assert numbers_supported("$25.00 after 15 days", ["A late charge of $25.00 after 15 days"])
    assert not numbers_supported("$35.00 after 15 days", ["A late charge of $25.00 after 15 days"])


def test_figures_may_come_from_different_quotes():
    quotes = ["NON-REFUNDABLE FEE: $250.00", "APPLICATION FEE: $220.00"]
    assert numbers_supported("$250.00 and $220.00", quotes)
    assert not numbers_supported("$250.00 and $225.00", quotes)


def test_a_figure_with_no_quotes_at_all_is_unsupported():
    assert not numbers_supported("$25.00", [])
