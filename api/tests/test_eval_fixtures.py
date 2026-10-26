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
loan_fixture = importlib.import_module("loan_fixture")

FIXTURES = [
    ("loan and lease", retrieval_fixture.CLAUSES, qa_fixture.ANSWERABLE, qa_fixture.UNANSWERABLE),
    ("job offer", offer_fixture.CLAUSES, offer_fixture.ANSWERABLE, offer_fixture.UNANSWERABLE),
    ("education loan", loan_fixture.CLAUSES, loan_fixture.ANSWERABLE, loan_fixture.UNANSWERABLE),
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


# --- choosing which fixture an evaluation runs over ---

fixtures_module = importlib.import_module("eval_fixtures")


def test_with_no_name_the_evaluation_runs_over_the_loan_and_lease_fixture():
    chosen = fixtures_module.pick(None)

    assert chosen.name == "loan-lease"
    assert chosen.report_prefix == "qa"
    assert len(chosen.clauses) == 17
    assert len(chosen.answerable) == 32 and len(chosen.unanswerable) == 18


def test_the_job_offer_fixture_has_its_own_kind_of_document_and_its_own_report_name():
    chosen = fixtures_module.pick("offer")

    assert (chosen.name, chosen.doc_type, chosen.report_prefix) == ("offer", "offer", "qa-offer")
    assert chosen.clauses is offer_fixture.CLAUSES
    assert len(chosen.answerable) == 25 and len(chosen.unanswerable) == 18


def test_an_unknown_name_is_refused_and_the_message_lists_the_real_ones():
    with pytest.raises(ValueError, match="loan-lease.*offer|offer.*loan-lease"):
        fixtures_module.pick("lease-only")


def test_no_two_fixtures_write_to_the_same_report_name():
    prefixes = [fixture.report_prefix for fixture in fixtures_module.FIXTURES.values()]

    assert len(prefixes) == len(set(prefixes))


def test_each_fixture_says_how_its_questions_were_written():
    for fixture in fixtures_module.FIXTURES.values():
        assert "before any results" in fixture.provenance


# --- the key terms ground truth: every field of a document type is accounted for ---

key_terms_fixture = importlib.import_module("key_terms_fixture")


@pytest.mark.parametrize("doc_type", ["loan", "lease", "offer"])
def test_the_key_terms_ground_truth_accounts_for_every_field_of_its_document_type(doc_type):
    from app.key_term_fields import fields_for

    spec = key_terms_fixture.DOCUMENTS[doc_type]
    named = {field.name for field in fields_for(doc_type)}

    accounted = set(spec["expected"]) | set(spec["ambiguous"])
    assert named - accounted == set(), f"{doc_type}: no ground truth for {named - accounted}"
    assert set(spec["expected"]) - named == set(), f"{doc_type}: ground truth for a field that does not exist"


@pytest.mark.parametrize("doc_type", ["loan", "lease", "offer"])
def test_every_clause_the_ground_truth_points_at_is_in_that_document(doc_type):
    spec = key_terms_fixture.DOCUMENTS[doc_type]

    for field, expected in spec["expected"].items():
        if expected is not None:
            assert expected[0] in spec["clauses"], f"{doc_type}.{field} points at a clause the document does not have"


def test_the_job_offer_document_is_the_whole_offer_fixture():
    assert key_terms_fixture.DOCUMENTS["offer"]["clauses"] == offer_fixture.CLAUSES


def test_the_education_loan_fixture_is_the_size_it_says_it_is_and_has_its_own_report_name():
    chosen = fixtures_module.pick("loan")

    assert (chosen.name, chosen.doc_type, chosen.report_prefix) == ("loan", "loan", "qa-loan")
    assert len(chosen.clauses) == 17 and len(chosen.answerable) == 24 and len(chosen.unanswerable) == 18
