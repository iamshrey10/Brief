"""The labeled documents and questions the evaluations run over. They are plain data, so a mistake in one
(a question pointing at a clause that does not exist, a repeated question, an unanswerable question that is
also listed as answerable) would quietly make a whole evaluation meaningless."""

import importlib
import sys
from pathlib import Path

import pytest

EVALS = Path(__file__).resolve().parent.parent.parent / "evals"
sys.path.insert(0, str(EVALS))

retrieval_fixture = importlib.import_module("retrieval_fixture")
qa_fixture = importlib.import_module("qa_fixture")
offer_fixture = importlib.import_module("offer_fixture")

FIXTURES = [
    ("loan and lease", retrieval_fixture.CLAUSES, qa_fixture.ANSWERABLE, qa_fixture.UNANSWERABLE),
    ("job offer", offer_fixture.CLAUSES, offer_fixture.ANSWERABLE, offer_fixture.UNANSWERABLE),
]
IDS = [name for name, *_ in FIXTURES]


@pytest.mark.parametrize(("name", "clauses", "answerable", "unanswerable"), FIXTURES, ids=IDS)
def test_every_answerable_question_points_at_a_clause_that_exists(name, clauses, answerable, unanswerable):
    for question, key, _difficulty in answerable:
        assert key in clauses, f"{name}: {question!r} points at {key!r}, which is not a clause"


@pytest.mark.parametrize(("name", "clauses", "answerable", "unanswerable"), FIXTURES, ids=IDS)
def test_no_question_is_asked_twice_or_is_both_answerable_and_not(name, clauses, answerable, unanswerable):
    questions = [question for question, _key, _difficulty in answerable]

    assert len(questions) == len(set(questions)), f"{name}: an answerable question is repeated"
    assert len(unanswerable) == len(set(unanswerable)), f"{name}: an unanswerable question is repeated"
    assert not set(questions) & set(unanswerable), f"{name}: a question is in both lists"


@pytest.mark.parametrize(("name", "clauses", "answerable", "unanswerable"), FIXTURES, ids=IDS)
def test_every_difficulty_is_one_the_report_knows_and_every_clause_is_asked_about(
    name, clauses, answerable, unanswerable
):
    assert {difficulty for _q, _k, difficulty in answerable} <= {"lexical", "paraphrase", "hard"}
    asked_about = {key for _q, key, _d in answerable}
    assert set(clauses) - asked_about == set(), f"{name}: no question is about {set(clauses) - asked_about}"


@pytest.mark.parametrize(("name", "clauses", "answerable", "unanswerable"), FIXTURES, ids=IDS)
def test_the_text_follows_the_house_style(name, clauses, answerable, unanswerable):
    everything = [*clauses.values(), *(q for q, _k, _d in answerable), *unanswerable]

    assert not [text for text in everything if "—" in text], f"{name}: an em dash"
    assert all(text.strip() == text and text for text in everything)


def test_the_job_offer_fixture_is_the_size_it_says_it_is():
    assert len(offer_fixture.CLAUSES) == 17
    assert len(offer_fixture.ANSWERABLE) == 25
    assert len(offer_fixture.UNANSWERABLE) == 18
