from app.grounding import normalize, quote_appears_in

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
