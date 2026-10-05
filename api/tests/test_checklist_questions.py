import re

import pytest

from app.checklist_questions import CHECKLISTS, questions_for
from app.main import DOC_TYPES


def test_every_upload_type_has_a_checklist():
    for doc_type in DOC_TYPES:
        assert questions_for(doc_type), doc_type


@pytest.mark.parametrize("doc_type", sorted(CHECKLISTS))
def test_ids_are_unique_stable_keys(doc_type):
    ids = [q.id for q in CHECKLISTS[doc_type]]
    assert len(ids) == len(set(ids))
    assert all(re.fullmatch(r"[a-z][a-z0-9_]*", i) for i in ids)


@pytest.mark.parametrize("doc_type", sorted(CHECKLISTS))
def test_every_question_is_complete(doc_type):
    for q in CHECKLISTS[doc_type]:
        assert q.question.strip().endswith("?"), q.id
        assert len(q.why_it_matters.strip()) > 20, q.id
        assert len(q.ask_them.strip()) > 10, q.id
        assert q.importance in ("high", "medium"), q.id


@pytest.mark.parametrize("doc_type", sorted(CHECKLISTS))
def test_each_list_flags_a_few_high_importance_gaps_but_not_everything(doc_type):
    importances = [q.importance for q in CHECKLISTS[doc_type]]
    assert importances.count("high") >= 3
    assert importances.count("medium") >= 1


@pytest.mark.parametrize("doc_type", sorted(CHECKLISTS))
def test_lists_stay_short_enough_for_one_model_call(doc_type):
    assert 6 <= len(CHECKLISTS[doc_type]) <= 12


def test_an_unknown_type_falls_back_to_the_generic_list():
    assert questions_for("something-new") == CHECKLISTS["other"]


def test_the_wording_never_tells_anyone_to_sign_or_not_to():
    banned = ("you should sign", "do not sign", "don't sign", "legal advice")
    for questions in CHECKLISTS.values():
        for q in questions:
            text = f"{q.question} {q.why_it_matters} {q.ask_them}".lower()
            assert not any(phrase in text for phrase in banned), q.id


def test_no_em_dashes_in_text_the_reader_sees():
    for questions in CHECKLISTS.values():
        for q in questions:
            assert "—" not in q.question + q.why_it_matters + q.ask_them
