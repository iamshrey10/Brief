import uuid

from app.reranker import rerank


def _candidates() -> dict[str, tuple[uuid.UUID, str]]:
    texts = {
        "late_fee": "A late fee of twenty five dollars applies if rent is more than five days overdue.",
        "prepay": "The borrower may repay all or part of the principal early without any prepayment penalty.",
        "pets": "Pets are not permitted in the unit without prior written consent of the landlord.",
        "deposit": "The security deposit will be returned within thirty days after the lease ends.",
    }
    return {name: (uuid.uuid4(), text) for name, text in texts.items()}


def test_rerank_puts_the_relevant_clause_first():
    candidates = _candidates()

    ranked = rerank("Can I pay off the loan early without a fee?", list(candidates.values()))

    assert ranked[0][0] == candidates["prepay"][0]


def test_rerank_handles_a_paraphrase_sharing_few_words_with_the_clause():
    candidates = _candidates()

    ranked = rerank("Am I allowed to have a dog?", list(candidates.values()))

    assert ranked[0][0] == candidates["pets"][0]


def test_rerank_returns_every_candidate_best_score_first():
    candidates = _candidates()

    ranked = rerank("When do I get my security deposit back?", list(candidates.values()))

    assert {clause_id for clause_id, _score in ranked} == {c[0] for c in candidates.values()}
    scores = [score for _clause_id, score in ranked]
    assert scores == sorted(scores, reverse=True)


def test_rerank_respects_the_limit():
    candidates = _candidates()

    ranked = rerank("What happens if rent is late?", list(candidates.values()), limit=2)

    assert len(ranked) == 2


def test_rerank_with_no_candidates_returns_nothing():
    assert rerank("anything at all", []) == []
