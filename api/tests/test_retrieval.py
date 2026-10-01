import uuid

from app.models import EMBEDDING_DIM, Clause, Document, Embedding, User
from app.retrieval import hybrid_search, keyword_search, reranked_search, vector_search


def _make_document(user: User, **overrides) -> Document:
    defaults = dict(
        user_id=user.id,
        filename="sample.pdf",
        doc_type="lease",
        status="ready",
        storage_key="fake/key.pdf",
        file_size_bytes=1024,
    )
    defaults.update(overrides)
    return Document(**defaults)


def _make_unit_vector(hot_index: int) -> list[float]:
    """A one-hot unit vector, so cosine distance between two of these is predictable:
    0 when hot_index matches, 1 (orthogonal) when it doesn't."""
    vector = [0.0] * EMBEDDING_DIM
    vector[hot_index] = 1.0
    return vector


def _make_clause(document: Document, index: int, text: str) -> Clause:
    return Clause(
        document_id=document.id,
        clause_index=index,
        page_number=1,
        char_start=0,
        char_end=len(text),
        text=text,
    )


async def test_keyword_search_finds_exact_term_matches(db_session, test_user):
    document = _make_document(test_user)
    db_session.add(document)
    await db_session.flush()

    db_session.add_all(
        [
            _make_clause(document, 0, "The prepayment penalty is waived for early payoff."),
            _make_clause(document, 1, "Interest accrues at a fixed annual rate."),
            _make_clause(document, 2, "A late fee of twenty five dollars applies after five days."),
        ]
    )
    await db_session.commit()

    results = await keyword_search(db_session, document.id, "prepayment penalty")

    assert len(results) == 1
    matched_clause = await db_session.get(Clause, results[0][0])
    assert "prepayment penalty" in matched_clause.text


async def test_keyword_search_ranks_stronger_matches_first(db_session, test_user):
    document = _make_document(test_user)
    db_session.add(document)
    await db_session.flush()

    strong = _make_clause(
        document, 0, "Late fee. Late fee applies. A late fee of twenty five dollars."
    )
    weak = _make_clause(document, 1, "Payments are due monthly, with no exceptions noted here.")
    db_session.add_all([strong, weak])
    await db_session.commit()

    results = await keyword_search(db_session, document.id, "late fee")

    assert len(results) == 1
    assert results[0][0] == strong.id


async def test_keyword_search_returns_nothing_for_a_term_not_present(db_session, test_user):
    document = _make_document(test_user)
    db_session.add(document)
    await db_session.flush()
    db_session.add(_make_clause(document, 0, "The grace period is six months after graduation."))
    await db_session.commit()

    results = await keyword_search(db_session, document.id, "skydiving")

    assert results == []


async def test_keyword_search_only_searches_the_given_document(db_session, test_user):
    mine = _make_document(test_user, filename="mine.pdf")
    other_user = User(email=f"{uuid.uuid4()}@example.com")
    db_session.add_all([mine, other_user])
    await db_session.flush()
    theirs = _make_document(other_user, filename="theirs.pdf")
    db_session.add(theirs)
    await db_session.flush()

    db_session.add_all(
        [
            _make_clause(mine, 0, "The deposit is fully refundable within thirty days."),
            _make_clause(theirs, 0, "The deposit is fully refundable within thirty days."),
        ]
    )
    await db_session.commit()

    results = await keyword_search(db_session, mine.id, "refundable deposit")

    assert len(results) == 1
    matched_clause = await db_session.get(Clause, results[0][0])
    assert matched_clause.document_id == mine.id


# --- vector_search: pgvector cosine distance over real stored embeddings ---


async def test_vector_search_ranks_the_closest_embedding_first(db_session, test_user):
    document = _make_document(test_user)
    db_session.add(document)
    await db_session.flush()

    close_clause = _make_clause(document, 0, "This clause means almost the same thing.")
    far_clause = _make_clause(document, 1, "This clause means something unrelated.")
    db_session.add_all([close_clause, far_clause])
    await db_session.flush()

    db_session.add_all(
        [
            Embedding(clause_id=close_clause.id, vector=_make_unit_vector(0)),
            Embedding(clause_id=far_clause.id, vector=_make_unit_vector(1)),
        ]
    )
    await db_session.commit()

    query_embedding = _make_unit_vector(0)  # identical direction to close_clause
    results = await vector_search(db_session, document.id, query_embedding)

    assert len(results) == 2
    assert results[0][0] == close_clause.id
    assert results[0][1] < results[1][1]  # lower cosine distance means more similar


async def test_vector_search_only_searches_the_given_document(db_session, test_user):
    mine = _make_document(test_user, filename="mine.pdf")
    other_user = User(email=f"{uuid.uuid4()}@example.com")
    db_session.add_all([mine, other_user])
    await db_session.flush()
    theirs = _make_document(other_user, filename="theirs.pdf")
    db_session.add(theirs)
    await db_session.flush()

    my_clause = _make_clause(mine, 0, "A clause that belongs to my document.")
    their_clause = _make_clause(theirs, 0, "A clause that belongs to someone else's document.")
    db_session.add_all([my_clause, their_clause])
    await db_session.flush()

    db_session.add_all(
        [
            Embedding(clause_id=my_clause.id, vector=_make_unit_vector(0)),
            Embedding(clause_id=their_clause.id, vector=_make_unit_vector(0)),
        ]
    )
    await db_session.commit()

    results = await vector_search(db_session, mine.id, _make_unit_vector(0))

    assert len(results) == 1
    assert results[0][0] == my_clause.id


# --- hybrid_search: reciprocal rank fusion of both signals ---


async def test_hybrid_search_ranks_a_clause_strong_on_both_signals_first(
    db_session, test_user, monkeypatch
):
    document = _make_document(test_user)
    db_session.add(document)
    await db_session.flush()

    strong_on_both = _make_clause(
        document, 0, "Prepayment penalty. Prepayment penalty is waived for early payoff."
    )
    keyword_only = _make_clause(document, 1, "A late fee may apply in some circumstances.")
    unrelated = _make_clause(document, 2, "Insurance coverage is required throughout the lease.")
    db_session.add_all([strong_on_both, keyword_only, unrelated])
    await db_session.flush()

    db_session.add_all(
        [
            Embedding(clause_id=strong_on_both.id, vector=_make_unit_vector(0)),
            Embedding(clause_id=keyword_only.id, vector=_make_unit_vector(5)),
            Embedding(clause_id=unrelated.id, vector=_make_unit_vector(10)),
        ]
    )
    await db_session.commit()

    monkeypatch.setattr("app.retrieval.embed_query", lambda query: _make_unit_vector(0))

    results = await hybrid_search(db_session, document.id, "prepayment penalty")

    assert results[0].id == strong_on_both.id


async def test_hybrid_search_surfaces_a_vector_only_match_keyword_search_would_miss(
    db_session, test_user, monkeypatch
):
    document = _make_document(test_user)
    db_session.add(document)
    await db_session.flush()

    paraphrased = _make_clause(document, 0, "You may pay off the balance early at no extra cost.")
    unrelated = _make_clause(document, 1, "The unit must be kept free of pets at all times.")
    db_session.add_all([paraphrased, unrelated])
    await db_session.flush()

    db_session.add_all(
        [
            Embedding(clause_id=paraphrased.id, vector=_make_unit_vector(0)),
            Embedding(clause_id=unrelated.id, vector=_make_unit_vector(10)),
        ]
    )
    await db_session.commit()

    # the query shares no real words with `paraphrased`, only keyword_search would miss it
    monkeypatch.setattr("app.retrieval.embed_query", lambda query: _make_unit_vector(0))

    results = await hybrid_search(db_session, document.id, "prepayment penalty")

    assert paraphrased.id in [clause.id for clause in results]


async def test_hybrid_search_respects_the_limit(db_session, test_user, monkeypatch):
    document = _make_document(test_user)
    db_session.add(document)
    await db_session.flush()

    clauses = [
        _make_clause(document, i, f"Fee number {i} applies under certain conditions.")
        for i in range(5)
    ]
    db_session.add_all(clauses)
    await db_session.flush()
    db_session.add_all(
        [Embedding(clause_id=c.id, vector=_make_unit_vector(i)) for i, c in enumerate(clauses)]
    )
    await db_session.commit()

    monkeypatch.setattr("app.retrieval.embed_query", lambda query: _make_unit_vector(0))

    results = await hybrid_search(db_session, document.id, "fee applies", limit=2)

    assert len(results) == 2


# --- reranked_search: hybrid shortlist, then a real cross-encoder re-judges it ---


async def test_reranked_search_corrects_a_hybrid_ordering_mistake(
    db_session, test_user, monkeypatch
):
    document = _make_document(test_user)
    db_session.add(document)
    await db_session.flush()

    wrong = _make_clause(
        document, 0, "A late fee of twenty five dollars applies if rent is more than five days overdue."
    )
    right = _make_clause(
        document,
        1,
        "The borrower may repay all or part of the principal early without any prepayment penalty.",
    )
    unrelated = _make_clause(document, 2, "Pets are not permitted without prior written consent.")
    db_session.add_all([wrong, right, unrelated])
    await db_session.flush()

    # `wrong` sits exactly on the query's embedding, so vector search favors it
    db_session.add_all(
        [
            Embedding(clause_id=wrong.id, vector=_make_unit_vector(0)),
            Embedding(clause_id=right.id, vector=_make_unit_vector(3)),
            Embedding(clause_id=unrelated.id, vector=_make_unit_vector(10)),
        ]
    )
    await db_session.commit()

    monkeypatch.setattr("app.retrieval.embed_query", lambda query: _make_unit_vector(0))
    query = "Can I pay off the loan early without a fee?"

    hybrid_results = await hybrid_search(db_session, document.id, query)
    assert hybrid_results[0].id == wrong.id  # precondition: hybrid alone gets this wrong

    reranked_results = await reranked_search(db_session, document.id, query)

    assert reranked_results[0].id == right.id


async def test_reranked_search_respects_the_limit(db_session, test_user, monkeypatch):
    document = _make_document(test_user)
    db_session.add(document)
    await db_session.flush()

    clauses = [
        _make_clause(document, i, f"Fee number {i} applies under certain conditions.")
        for i in range(5)
    ]
    db_session.add_all(clauses)
    await db_session.flush()
    db_session.add_all(
        [Embedding(clause_id=c.id, vector=_make_unit_vector(i)) for i, c in enumerate(clauses)]
    )
    await db_session.commit()

    monkeypatch.setattr("app.retrieval.embed_query", lambda query: _make_unit_vector(0))

    results = await reranked_search(db_session, document.id, "fee applies", limit=2)

    assert len(results) == 2


async def test_reranked_search_returns_nothing_for_a_document_with_no_clauses(
    db_session, test_user, monkeypatch
):
    document = _make_document(test_user)
    db_session.add(document)
    await db_session.commit()

    monkeypatch.setattr("app.retrieval.embed_query", lambda query: _make_unit_vector(0))

    assert await reranked_search(db_session, document.id, "anything") == []
