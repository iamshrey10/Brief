import uuid

from app.models import Clause, Document, User
from app.retrieval import keyword_search


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
