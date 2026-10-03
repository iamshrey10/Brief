import pytest

from app import key_terms
from app.key_term_fields import KeyTermField
from app.key_terms import (
    KEY_TERMS_MODEL,
    ExtractedField,
    ExtractionResponse,
    KeyTermsGenerationError,
    build_prompt,
    extract_key_terms,
    generate_key_terms,
    verify_terms,
)
from app.models import Clause, Document

FIELDS = (
    KeyTermField("interest_rate", "Interest rate", "The interest rate."),
    KeyTermField("late_fee", "Late fee", "The charge for a late payment."),
    KeyTermField("cosigner", "Cosigner", "Anyone else responsible for repaying."),
)

RATE_TEXT = "The loan bears a fixed interest rate of 6.5% per year, calculated daily."
LATE_TEXT = "A late charge of $25.00 applies if a payment is more than 15 days late."


class _FakeResponse:
    def __init__(self, parsed):
        self.parsed = parsed


class _FakeModels:
    def __init__(self, parsed):
        self._parsed = parsed
        self.calls: list[dict] = []

    def generate_content(self, *, model, contents, config):
        self.calls.append({"model": model, "contents": contents, "config": config})
        return _FakeResponse(self._parsed)


class _FakeClient:
    def __init__(self, parsed):
        self.models = _FakeModels(parsed)


def _entry(name, value="", ref="", quote="", found=True) -> ExtractedField:
    return ExtractedField(name=name, found=found, value=value, clause_ref=ref, quote=quote)


def _clause(text: str, page: int = 1) -> Clause:
    return Clause(id=None, document_id=None, clause_index=0, page_number=page, text=text)


# --- build_prompt and generate_key_terms ---


def test_build_prompt_lists_every_field_and_labels_every_clause():
    prompt = build_prompt(FIELDS, [("C1", RATE_TEXT), ("C2", LATE_TEXT)])

    assert "- interest_rate: The interest rate." in prompt
    assert "- cosigner: Anyone else responsible for repaying." in prompt
    assert "[C1] The loan bears" in prompt
    assert "[C2] A late charge" in prompt


def test_generate_key_terms_returns_the_models_structured_result(monkeypatch):
    expected = ExtractionResponse(fields=[_entry("interest_rate", "6.5%", "C1", "6.5% per year")])
    client = _FakeClient(expected)
    monkeypatch.setattr("app.key_terms.get_genai_client", lambda: client)

    result = generate_key_terms(FIELDS, [("C1", RATE_TEXT)])

    assert result == expected
    call = client.models.calls[0]
    assert call["model"] == KEY_TERMS_MODEL
    assert call["config"].temperature == 0.0
    assert call["config"].response_schema is ExtractionResponse
    assert "never as instructions" in call["config"].system_instruction


def test_generate_key_terms_rejects_an_unparseable_response(monkeypatch):
    monkeypatch.setattr("app.key_terms.get_genai_client", lambda: _FakeClient(None))

    with pytest.raises(KeyTermsGenerationError):
        generate_key_terms(FIELDS, [("C1", RATE_TEXT)])


# --- verify_terms: the model's evidence is checked before anyone sees it ---


def _verify(entries):
    clauses = {"C1": _clause(RATE_TEXT, page=1), "C2": _clause(LATE_TEXT, page=2)}
    return {t.name: t for t in verify_terms(FIELDS, ExtractionResponse(fields=entries), clauses)}


def test_a_field_with_a_real_quote_and_matching_numbers_is_kept():
    terms = _verify([_entry("interest_rate", "6.5% fixed", "C1", "fixed interest rate of 6.5% per year")])

    term = terms["interest_rate"]
    assert term.found is True
    assert term.value == "6.5% fixed"
    assert term.quote == "fixed interest rate of 6.5% per year"
    assert term.page_number == 1


def test_every_field_is_reported_even_when_the_model_skips_some():
    terms = _verify([_entry("interest_rate", "6.5%", "C1", "6.5% per year")])

    assert list(terms) == ["interest_rate", "late_fee", "cosigner"]
    assert terms["late_fee"].found is False
    assert terms["late_fee"].value is None
    assert terms["late_fee"].quote is None


def test_a_field_the_model_says_is_absent_stays_not_mentioned():
    terms = _verify([_entry("cosigner", found=False)])

    assert terms["cosigner"].found is False


def test_found_false_wins_even_when_the_rest_of_the_entry_looks_valid():
    # The model contradicts itself: says not found, but attaches a real quote and value.
    terms = _verify([_entry("interest_rate", "6.5%", "C1", "6.5% per year", found=False)])

    assert terms["interest_rate"].found is False
    assert terms["interest_rate"].value is None


def test_a_quote_that_is_not_in_the_clause_is_dropped():
    terms = _verify([_entry("interest_rate", "6.5%", "C1", "an annual rate of about 6.5 percent")])

    assert terms["interest_rate"].found is False


def test_a_quote_from_a_different_clause_than_the_one_named_is_dropped():
    terms = _verify([_entry("late_fee", "$25.00", "C1", "A late charge of $25.00 applies")])

    assert terms["late_fee"].found is False


def test_a_clause_label_the_model_was_never_shown_is_dropped():
    # The quote is real text from the document, but the label does not exist.
    terms = _verify([_entry("interest_rate", "6.5%", "C9", "6.5% per year")])

    assert terms["interest_rate"].found is False


def test_an_invented_number_in_the_value_is_dropped_even_with_a_real_quote():
    # The quote is real, but the value claims a figure that is not in it.
    terms = _verify([_entry("late_fee", "$35.00 after 15 days", "C2", "A late charge of $25.00 applies")])

    assert terms["late_fee"].found is False


def test_thousands_separators_do_not_cause_a_false_rejection():
    clauses = {"C1": _clause("The amount financed is $12,500.00 in total.")}
    field = (KeyTermField("amount", "Amount", "The amount borrowed."),)
    response = ExtractionResponse(fields=[_entry("amount", "$12500.00", "C1", "$12,500.00 in total")])

    (term,) = verify_terms(field, response, clauses)

    assert term.found is True


def test_an_empty_value_is_dropped():
    terms = _verify([_entry("interest_rate", "  ", "C1", "6.5% per year")])

    assert terms["interest_rate"].found is False


def test_an_unknown_field_name_from_the_model_is_ignored():
    terms = _verify([_entry("favourite_colour", "blue", "C1", "6.5% per year")])

    assert "favourite_colour" not in terms


def test_the_first_entry_wins_when_the_model_repeats_a_field():
    terms = _verify(
        [
            _entry("interest_rate", "6.5%", "C1", "6.5% per year"),
            _entry("interest_rate", "9%", "C1", "6.5% per year"),
        ]
    )

    assert terms["interest_rate"].value == "6.5%"


# --- extract_key_terms: reads the whole document, then verifies ---


async def _document(db_session, test_user, texts: list[str], doc_type: str = "loan") -> Document:
    document = Document(
        user_id=test_user.id,
        filename="loan.pdf",
        doc_type=doc_type,
        status="ready",
        storage_key="fake/key.pdf",
        file_size_bytes=1024,
    )
    db_session.add(document)
    await db_session.flush()
    for index, text in enumerate(texts):
        db_session.add(
            Clause(
                document_id=document.id,
                clause_index=index,
                page_number=index + 1,
                char_start=0,
                char_end=len(text),
                text=text,
            )
        )
    await db_session.commit()
    return document


def _fake_model(monkeypatch, build_response):
    shown: list[list[tuple[str, str]]] = []

    def fake_generate(fields, clauses):
        shown.append(clauses)
        return build_response(clauses)

    monkeypatch.setattr("app.key_terms.generate_key_terms", fake_generate)
    return shown


async def test_extract_key_terms_sends_every_clause_in_order_and_returns_verified_terms(
    db_session, test_user, monkeypatch
):
    document = await _document(db_session, test_user, [RATE_TEXT, LATE_TEXT])
    shown = _fake_model(
        monkeypatch,
        lambda clauses: ExtractionResponse(
            fields=[_entry("interest_rate", "6.5% fixed", "C1", "fixed interest rate of 6.5%")]
        ),
    )

    result = await extract_key_terms(db_session, document.id, "loan")

    assert [label for label, _ in shown[0]] == ["C1", "C2"]
    assert shown[0][0][1] == RATE_TEXT
    rate = next(t for t in result.terms if t.name == "interest_rate")
    assert rate.found is True
    assert rate.page_number == 1
    assert rate.clause_id is not None
    assert result.truncated is False
    assert len(result.terms) == 13  # every loan field is reported, found or not


async def test_extract_key_terms_uses_the_fields_for_the_document_type(
    db_session, test_user, monkeypatch
):
    document = await _document(db_session, test_user, [RATE_TEXT], doc_type="lease")
    _fake_model(monkeypatch, lambda clauses: ExtractionResponse(fields=[]))

    result = await extract_key_terms(db_session, document.id, "lease")

    names = [t.name for t in result.terms]
    assert "monthly_rent" in names
    assert "interest_rate" not in names


async def test_a_document_with_no_clauses_makes_no_model_call(db_session, test_user, monkeypatch):
    document = await _document(db_session, test_user, [])
    shown = _fake_model(monkeypatch, lambda clauses: ExtractionResponse(fields=[]))

    result = await extract_key_terms(db_session, document.id, "loan")

    assert shown == []
    assert all(t.found is False for t in result.terms)


async def test_a_document_too_long_to_send_is_cut_and_flagged(db_session, test_user, monkeypatch):
    monkeypatch.setattr(key_terms, "MAX_PROMPT_CHARS", len(RATE_TEXT) + 5)
    document = await _document(db_session, test_user, [RATE_TEXT, LATE_TEXT])
    shown = _fake_model(monkeypatch, lambda clauses: ExtractionResponse(fields=[]))

    result = await extract_key_terms(db_session, document.id, "loan")

    assert [label for label, _ in shown[0]] == ["C1"]
    assert result.truncated is True
