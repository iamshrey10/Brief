import uuid

import pytest
from sqlalchemy import select

from app import checklist as checklist_module
from app import document_text
from app.checklist import (
    CHECKLIST_MODEL,
    MAX_EVIDENCE,
    ChecklistEntry,
    ChecklistGenerationError,
    ChecklistResponse,
    Evidence,
    JudgeResponse,
    Verdict,
    answer_checklist,
    build_judge_prompt,
    build_prompt,
    generate_checklist,
    get_checklist,
    judge_answers,
    load_checklist,
    save_checklist,
    verify_answers,
)
from app.checklist_questions import ChecklistQuestion
from app.models import ChecklistAnswerRow, Clause, Document

QUESTIONS = (
    ChecklistQuestion(
        "prepay", "Can I pay it off early?", "Fees can punish early payment.", "Any early fee?", "high"
    ),
    ChecklistQuestion(
        "late", "What is the late fee?", "Small delays get costly.", "What is the late fee?", "medium"
    ),
    ChecklistQuestion(
        "fees", "Which fees are there?", "Fees add to the real cost.", "List every fee.", "high"
    ),
)

PREPAY_TEXT = "The borrower may prepay all or part of the loan at any time without penalty."
LATE_TEXT = "A late charge of $25.00 applies if a payment is more than 15 days late."
FEES_TEXT = "NON-REFUNDABLE FEE:\n$250.00\nTAX (0.0)\n$0.00\nTOTAL\n$250.00\nAPPLICATION FEE:\n$220.00"


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


def _clause(text: str, page: int = 1) -> Clause:
    return Clause(id=uuid.uuid4(), document_id=None, clause_index=0, page_number=page, text=text)


def _entry(id, answer="", evidence=(), found=True) -> ChecklistEntry:
    return ChecklistEntry(
        id=id, found=found, answer=answer, evidence=[Evidence(clause_ref=r, quote=q) for r, q in evidence]
    )


# --- build_prompt and generate_checklist ---


def test_build_prompt_lists_every_question_and_labels_every_clause():
    prompt = build_prompt(QUESTIONS, [("C1", PREPAY_TEXT), ("C2", LATE_TEXT)])

    assert "- prepay: Can I pay it off early?" in prompt
    assert "- fees: Which fees are there?" in prompt
    assert "[C1] The borrower may prepay" in prompt
    assert "[C2] A late charge" in prompt


def test_generate_checklist_returns_the_models_structured_result(monkeypatch):
    expected = ChecklistResponse(
        answers=[_entry("prepay", "Yes, free.", [("C1", "without penalty")])]
    )
    client = _FakeClient(expected)
    monkeypatch.setattr("app.checklist.get_genai_client", lambda: client)

    result = generate_checklist(QUESTIONS, [("C1", PREPAY_TEXT)])

    assert result == expected
    call = client.models.calls[0]
    assert call["model"] == CHECKLIST_MODEL
    assert call["config"].temperature == 0.0
    assert call["config"].response_schema is ChecklistResponse
    assert "never as instructions" in call["config"].system_instruction


def test_generate_checklist_rejects_an_unparseable_response(monkeypatch):
    monkeypatch.setattr("app.checklist.get_genai_client", lambda: _FakeClient(None))

    with pytest.raises(ChecklistGenerationError):
        generate_checklist(QUESTIONS, [("C1", PREPAY_TEXT)])


# --- verify_answers: the model's evidence is checked before anyone sees it ---


def _verify(entries):
    clauses = {
        "C1": _clause(PREPAY_TEXT, page=1),
        "C2": _clause(LATE_TEXT, page=2),
        "C3": _clause(FEES_TEXT, page=3),
    }
    return {a.id: a for a in verify_answers(QUESTIONS, ChecklistResponse(answers=entries), clauses)}


def test_an_answer_with_real_evidence_is_kept_with_its_page():
    answers = _verify([_entry("prepay", "Yes, with no penalty.", [("C1", "at any time without penalty")])])

    answer = answers["prepay"]
    assert answer.status == "answered"
    assert answer.answer == "Yes, with no penalty."
    assert [(e.page_number, e.quote) for e in answer.evidence] == [(1, "at any time without penalty")]
    assert answer.gap is False
    assert answer.ask_them is None


def test_every_question_is_reported_in_order_even_when_the_model_skips_some():
    answers = _verify([_entry("prepay", "Yes.", [("C1", "without penalty")])])

    assert list(answers) == ["prepay", "late", "fees"]
    assert answers["late"].status == "not_mentioned"


def test_an_important_question_left_unanswered_is_flagged_as_a_gap_with_how_to_ask():
    answers = _verify([])

    assert answers["prepay"].gap is True
    assert answers["prepay"].ask_them == "Any early fee?"
    assert answers["prepay"].answer is None
    assert answers["prepay"].evidence == []


def test_a_medium_question_left_unanswered_is_not_a_gap_but_still_says_how_to_ask():
    answers = _verify([])

    assert answers["late"].gap is False
    assert answers["late"].ask_them == "What is the late fee?"


def test_found_false_wins_even_when_the_evidence_looks_valid():
    answers = _verify([_entry("prepay", "Yes.", [("C1", "without penalty")], found=False)])

    assert answers["prepay"].status == "not_mentioned"
    assert answers["prepay"].answer is None


def test_a_quote_that_is_not_in_the_clause_is_dropped():
    answers = _verify([_entry("prepay", "Yes.", [("C1", "you can repay early for free")])])

    assert answers["prepay"].status == "not_mentioned"


def test_a_quote_from_a_different_clause_than_the_one_named_is_dropped():
    answers = _verify([_entry("prepay", "Yes.", [("C2", "without penalty")])])

    assert answers["prepay"].status == "not_mentioned"


def test_a_clause_label_the_model_was_never_shown_is_dropped():
    # The quote is real text from the document, but the label does not exist.
    answers = _verify([_entry("prepay", "Yes.", [("C9", "without penalty")])])

    assert answers["prepay"].status == "not_mentioned"


def test_an_invented_figure_in_the_answer_is_dropped_even_with_a_real_quote():
    answers = _verify([_entry("late", "$35.00 after 15 days.", [("C2", "A late charge of $25.00 applies")])])

    assert answers["late"].status == "not_mentioned"


def test_an_answer_resting_on_two_separate_passages_is_kept():
    # The two fees are on non-adjacent lines of one clause, so each is its own quote.
    answers = _verify(
        [
            _entry(
                "fees",
                "A $250.00 non-refundable fee and a $220.00 application fee.",
                [("C3", "NON-REFUNDABLE FEE:\n$250.00"), ("C3", "APPLICATION FEE:\n$220.00")],
            )
        ]
    )

    assert answers["fees"].status == "answered"
    assert len(answers["fees"].evidence) == 2


def test_a_figure_missing_from_every_quote_is_still_dropped_with_several_quotes():
    answers = _verify(
        [
            _entry(
                "fees",
                "A $250.00 fee and a $225.00 fee.",
                [("C3", "NON-REFUNDABLE FEE:\n$250.00"), ("C3", "APPLICATION FEE:\n$220.00")],
            )
        ]
    )

    assert answers["fees"].status == "not_mentioned"


def test_bad_evidence_is_dropped_but_good_evidence_beside_it_is_kept():
    answers = _verify(
        [_entry("prepay", "Yes.", [("C1", "invented words"), ("C1", "without penalty")])]
    )

    assert answers["prepay"].status == "answered"
    assert [e.quote for e in answers["prepay"].evidence] == ["without penalty"]


def test_an_answer_with_no_evidence_at_all_is_dropped():
    answers = _verify([_entry("prepay", "Yes.", [])])

    assert answers["prepay"].status == "not_mentioned"


def test_evidence_is_capped():
    quotes = [("C1", "prepay all or part"), ("C1", "of the loan"), ("C1", "at any time"), ("C1", "without penalty")]
    answers = _verify([_entry("prepay", "Yes.", quotes)])

    assert len(answers["prepay"].evidence) == MAX_EVIDENCE == 3


def test_an_empty_answer_is_dropped():
    answers = _verify([_entry("prepay", "  ", [("C1", "without penalty")])])

    assert answers["prepay"].status == "not_mentioned"


def test_an_unknown_question_id_from_the_model_is_ignored():
    answers = _verify([_entry("favourite_colour", "blue", [("C1", "without penalty")])])

    assert "favourite_colour" not in answers


def test_the_first_entry_wins_when_the_model_repeats_a_question():
    answers = _verify(
        [
            _entry("prepay", "Yes, free.", [("C1", "without penalty")]),
            _entry("prepay", "No, costly.", [("C1", "without penalty")]),
        ]
    )

    assert answers["prepay"].answer == "Yes, free."


# --- answer_checklist: reads the whole document, then verifies ---


async def _document(db_session, test_user, texts: list[str], doc_type: str = "loan") -> Document:
    document = Document(
        user_id=test_user.id,
        filename="doc.pdf",
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


def _fake_model(monkeypatch, build_response, judge=None):
    """Replaces both model calls. The judge confirms every answer unless `judge` says otherwise,
    and receives the (question, answer) pairs it was shown."""
    seen: list[tuple] = []

    def fake_generate(questions, clauses):
        seen.append((questions, clauses))
        return build_response(clauses)

    monkeypatch.setattr("app.checklist.generate_checklist", fake_generate)
    monkeypatch.setattr(
        "app.checklist.judge_answers", judge or (lambda items: {q.id for q, _ in items})
    )
    return seen


async def test_answer_checklist_sends_every_clause_and_returns_verified_answers(
    db_session, test_user, monkeypatch
):
    document = await _document(db_session, test_user, [PREPAY_TEXT, LATE_TEXT])
    seen = _fake_model(
        monkeypatch,
        lambda clauses: ChecklistResponse(
            answers=[_entry("prepayment", "Yes, free.", [("C1", "without penalty")])]
        ),
    )

    result = await answer_checklist(db_session, document.id, "loan")

    _questions, clauses = seen[0]
    assert [label for label, _ in clauses] == ["C1", "C2"]
    prepay = next(a for a in result.answers if a.id == "prepayment")
    assert prepay.status == "answered" and prepay.evidence[0].page_number == 1
    assert len(result.answers) == 10  # every loan question is reported, answered or not
    assert result.truncated is False


async def test_answer_checklist_uses_the_questions_for_the_document_type(
    db_session, test_user, monkeypatch
):
    document = await _document(db_session, test_user, [PREPAY_TEXT], doc_type="lease")
    _fake_model(monkeypatch, lambda clauses: ChecklistResponse(answers=[]))

    result = await answer_checklist(db_session, document.id, "lease")

    ids = [a.id for a in result.answers]
    assert "security_deposit" in ids
    assert "prepayment" not in ids


async def test_a_document_with_no_clauses_makes_no_model_call(db_session, test_user, monkeypatch):
    document = await _document(db_session, test_user, [])
    seen = _fake_model(monkeypatch, lambda clauses: ChecklistResponse(answers=[]))

    result = await answer_checklist(db_session, document.id, "loan")

    assert seen == []
    assert all(a.status == "not_mentioned" for a in result.answers)


async def test_a_document_too_long_to_send_is_cut_and_flagged(db_session, test_user, monkeypatch):
    monkeypatch.setattr(document_text, "MAX_PROMPT_CHARS", len(PREPAY_TEXT) + 5)
    document = await _document(db_session, test_user, [PREPAY_TEXT, LATE_TEXT])
    seen = _fake_model(monkeypatch, lambda clauses: ChecklistResponse(answers=[]))

    result = await answer_checklist(db_session, document.id, "loan")

    assert [label for label, _ in seen[0][1]] == ["C1"]
    assert result.truncated is True


# --- the second check: does the quoted text actually answer the question? ---


def _answered(id="prepay", quote="without penalty"):
    from app.checklist import ChecklistAnswer, EvidenceOut

    return ChecklistAnswer(
        id=id,
        question="Can I pay it off early?",
        why_it_matters="w",
        importance="high",
        status="answered",
        answer="Yes.",
        evidence=[EvidenceOut(clause_id="x", page_number=1, quote=quote)],
    )


def test_the_judge_prompt_shows_only_each_question_and_its_quotes():
    items = [(QUESTIONS[0], _answered("prepay", "at any time without penalty"))]

    prompt = build_judge_prompt(items)

    assert "id: prepay" in prompt
    assert "question: Can I pay it off early?" in prompt
    assert '"at any time without penalty"' in prompt
    # It must not carry the model's own answer, or the judge would just be agreeing with it.
    assert "Yes." not in prompt


def test_judge_answers_returns_only_the_ids_the_judge_confirms(monkeypatch):
    client = _FakeClient(
        JudgeResponse(verdicts=[Verdict(id="prepay", answers=True), Verdict(id="fees", answers=False)])
    )
    monkeypatch.setattr("app.checklist.get_genai_client", lambda: client)

    confirmed = judge_answers([(QUESTIONS[0], _answered("prepay")), (QUESTIONS[2], _answered("fees"))])

    assert confirmed == {"prepay"}
    call = client.models.calls[0]
    assert call["model"] == CHECKLIST_MODEL
    assert call["config"].temperature == 0.0
    assert call["config"].response_schema is JudgeResponse
    assert "merely mentions the topic" in call["config"].system_instruction


def test_judge_answers_rejects_an_unparseable_response(monkeypatch):
    monkeypatch.setattr("app.checklist.get_genai_client", lambda: _FakeClient(None))

    with pytest.raises(ChecklistGenerationError):
        judge_answers([(QUESTIONS[0], _answered())])


async def test_an_answer_the_judge_does_not_confirm_is_withheld_as_not_mentioned(
    db_session, test_user, monkeypatch
):
    document = await _document(db_session, test_user, [PREPAY_TEXT])
    _fake_model(monkeypatch, _prepay_response, judge=lambda items: set())

    result = await answer_checklist(db_session, document.id, "loan")

    prepay = next(a for a in result.answers if a.id == "prepayment")
    assert prepay.status == "not_mentioned"
    assert prepay.gap is True and prepay.ask_them
    assert prepay.answer is None and prepay.evidence == []


async def test_a_confirmed_answer_is_kept(db_session, test_user, monkeypatch):
    document = await _document(db_session, test_user, [PREPAY_TEXT])
    _fake_model(monkeypatch, _prepay_response, judge=lambda items: {q.id for q, _ in items})

    result = await answer_checklist(db_session, document.id, "loan")

    assert next(a for a in result.answers if a.id == "prepayment").status == "answered"


async def test_an_answer_the_judge_says_nothing_about_is_withheld(db_session, test_user, monkeypatch):
    # The judge leaves the id out entirely: not confirmed means not shown.
    document = await _document(db_session, test_user, [PREPAY_TEXT])
    _fake_model(monkeypatch, _prepay_response, judge=lambda items: {"some_other_id"})

    result = await answer_checklist(db_session, document.id, "loan")

    assert next(a for a in result.answers if a.id == "prepayment").status == "not_mentioned"


async def test_the_judge_is_shown_only_the_answers_that_passed_the_first_checks(
    db_session, test_user, monkeypatch
):
    document = await _document(db_session, test_user, [PREPAY_TEXT])
    shown: list[list[str]] = []

    def judge(items):
        shown.append([q.id for q, _ in items])
        return {q.id for q, _ in items}

    # One answer with real evidence, one whose quote is invented and so never reaches the judge.
    _fake_model(
        monkeypatch,
        lambda clauses: ChecklistResponse(
            answers=[
                _entry("prepayment", "Yes, free.", [("C1", "at any time without penalty")]),
                _entry("late_payment", "Five percent.", [("C1", "an invented quote")]),
            ]
        ),
        judge=judge,
    )

    await answer_checklist(db_session, document.id, "loan")

    assert shown == [["prepayment"]]


async def test_when_nothing_is_answered_the_judge_is_not_called(db_session, test_user, monkeypatch):
    document = await _document(db_session, test_user, [PREPAY_TEXT])
    shown: list = []
    _fake_model(
        monkeypatch,
        lambda clauses: ChecklistResponse(answers=[]),
        judge=lambda items: shown.append(items) or set(),
    )

    await answer_checklist(db_session, document.id, "loan")

    assert shown == []


async def test_if_the_judge_call_fails_the_whole_checklist_fails_instead_of_showing_unchecked_answers(
    db_session, test_user, monkeypatch
):
    document = await _document(db_session, test_user, [PREPAY_TEXT])

    def failing_judge(items):
        raise ChecklistGenerationError("model did not return a valid structured verdict")

    _fake_model(monkeypatch, _prepay_response, judge=failing_judge)

    with pytest.raises(ChecklistGenerationError):
        await answer_checklist(db_session, document.id, "loan")


# --- saving and loading: answer once, then reuse ---


def _prepay_response(clauses) -> ChecklistResponse:
    return ChecklistResponse(
        answers=[_entry("prepayment", "Yes, free.", [("C1", "at any time without penalty")])]
    )


async def _saved_rows(db_session, document) -> list[ChecklistAnswerRow]:
    result = await db_session.execute(
        select(ChecklistAnswerRow).where(ChecklistAnswerRow.document_id == document.id)
    )
    return list(result.scalars())


async def test_nothing_is_loaded_before_the_checklist_has_run(db_session, test_user):
    document = await _document(db_session, test_user, [PREPAY_TEXT])

    assert await load_checklist(db_session, document.id, "loan") is None


async def test_saved_answers_load_back_with_their_evidence_and_page(
    db_session, test_user, monkeypatch
):
    document = await _document(db_session, test_user, [PREPAY_TEXT, LATE_TEXT])
    _fake_model(monkeypatch, _prepay_response)
    answered = await answer_checklist(db_session, document.id, "loan")

    await save_checklist(db_session, document.id, answered)
    loaded = await load_checklist(db_session, document.id, "loan")

    assert loaded == answered
    prepay = next(a for a in loaded.answers if a.id == "prepayment")
    assert prepay.status == "answered"
    assert [(e.page_number, e.quote) for e in prepay.evidence] == [
        (1, "at any time without penalty")
    ]


async def test_every_question_is_saved_including_the_ones_not_answered(
    db_session, test_user, monkeypatch
):
    document = await _document(db_session, test_user, [PREPAY_TEXT])
    _fake_model(monkeypatch, _prepay_response)
    await save_checklist(
        db_session, document.id, await answer_checklist(db_session, document.id, "loan")
    )

    rows = await _saved_rows(db_session, document)

    assert len(rows) == 10
    assert sum(1 for r in rows if r.answer is not None) == 1
    assert all(r.evidence == [] for r in rows if r.answer is None)


async def test_loading_is_treated_as_missing_if_a_question_was_never_saved(
    db_session, test_user, monkeypatch
):
    document = await _document(db_session, test_user, [PREPAY_TEXT])
    _fake_model(monkeypatch, _prepay_response)
    await save_checklist(
        db_session, document.id, await answer_checklist(db_session, document.id, "loan")
    )
    for row in await _saved_rows(db_session, document):
        if row.question_id == "total_cost":
            await db_session.delete(row)
    await db_session.commit()

    assert await load_checklist(db_session, document.id, "loan") is None


async def test_saving_twice_updates_in_place_instead_of_failing_or_duplicating(
    db_session, test_user, monkeypatch
):
    document = await _document(db_session, test_user, [PREPAY_TEXT])
    _fake_model(monkeypatch, lambda clauses: ChecklistResponse(answers=[]))
    await save_checklist(
        db_session, document.id, await answer_checklist(db_session, document.id, "loan")
    )
    _fake_model(monkeypatch, _prepay_response)

    await save_checklist(
        db_session, document.id, await answer_checklist(db_session, document.id, "loan")
    )

    rows = await _saved_rows(db_session, document)
    assert len(rows) == 10
    assert next(r for r in rows if r.question_id == "prepayment").answer == "Yes, free."


async def test_the_model_is_called_once_then_the_saved_copy_is_reused(
    db_session, test_user, monkeypatch
):
    document = await _document(db_session, test_user, [PREPAY_TEXT])
    seen = _fake_model(monkeypatch, _prepay_response)

    first = await get_checklist(db_session, document.id, "loan")
    second = await get_checklist(db_session, document.id, "loan")

    assert len(seen) == 1
    assert second == first


async def test_a_cut_off_document_is_returned_but_not_saved(db_session, test_user, monkeypatch):
    monkeypatch.setattr(document_text, "MAX_PROMPT_CHARS", len(PREPAY_TEXT) + 5)
    document = await _document(db_session, test_user, [PREPAY_TEXT, LATE_TEXT])
    seen = _fake_model(monkeypatch, _prepay_response)

    first = await get_checklist(db_session, document.id, "loan")
    await get_checklist(db_session, document.id, "loan")

    assert first.truncated is True
    assert await _saved_rows(db_session, document) == []
    assert len(seen) == 2  # not cached, so it asks again


async def test_improved_ask_them_wording_reaches_a_document_that_was_already_checked(
    db_session, test_user, monkeypatch
):
    document = await _document(db_session, test_user, [PREPAY_TEXT])
    _fake_model(monkeypatch, _prepay_response)
    await get_checklist(db_session, document.id, "loan")

    real_questions = checklist_module.questions_for

    def reworded(doc_type):
        return tuple(
            ChecklistQuestion(q.id, q.question, q.why_it_matters, "NEW WORDING", q.importance)
            for q in real_questions(doc_type)
        )

    monkeypatch.setattr(checklist_module, "questions_for", reworded)
    loaded = await load_checklist(db_session, document.id, "loan")

    unanswered = next(a for a in loaded.answers if a.status == "not_mentioned")
    assert unanswered.ask_them == "NEW WORDING"
