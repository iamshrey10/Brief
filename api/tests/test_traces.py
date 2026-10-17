import logging

import pytest
from sqlalchemy import select

from app import request_id
from app.models import AnswerTrace, Document
from app.traces import record_trace


@pytest.fixture
async def document(db_session, test_user) -> Document:
    document = Document(
        user_id=test_user.id,
        filename="lease.pdf",
        doc_type="lease",
        status="ready",
        storage_key="fake/key.pdf",
        file_size_bytes=1024,
        content_type="application/pdf",
    )
    db_session.add(document)
    await db_session.commit()
    await db_session.refresh(document)
    return document


def _record(session, user, document, **overrides):
    values = dict(
        user_id=user.id,
        document_id=document.id,
        kind="ask",
        outcome="answered",
        retrieved=["c1", "c2"],
        cited=["c2"],
        elapsed_ms=1800,
    )
    values.update(overrides)
    return record_trace(session, **values)


async def test_it_saves_what_the_answer_used_with_the_id_of_the_request_being_handled(
    db_session, test_user, document
):
    token = request_id.current.set("3f2b8c1e-9d4a-4e07-8a55-0c1d2e3f4a5b")
    try:
        await _record(db_session, test_user, document)
    finally:
        request_id.current.reset(token)

    row = await db_session.scalar(select(AnswerTrace))
    assert row.request_id == "3f2b8c1e-9d4a-4e07-8a55-0c1d2e3f4a5b"
    assert (row.kind, row.outcome, row.elapsed_ms) == ("ask", "answered", 1800)
    assert (row.retrieved, row.cited) == (["c1", "c2"], ["c2"])
    assert row.user_id == test_user.id and row.document_id == document.id


async def test_outside_a_request_the_id_is_a_dash(db_session, test_user, document):
    await _record(db_session, test_user, document)

    assert await db_session.scalar(select(AnswerTrace.request_id)) == "-"


@pytest.mark.parametrize("outcome", ["answered", "not_found", "withheld", "nothing_to_search", "failed"])
async def test_every_known_outcome_can_be_saved(db_session, test_user, document, outcome):
    await _record(db_session, test_user, document, outcome=outcome)

    assert await db_session.scalar(select(AnswerTrace.outcome)) == outcome


async def test_an_outcome_nobody_defined_is_refused_so_the_list_stays_fixed(db_session, test_user, document):
    with pytest.raises(ValueError):
        await _record(db_session, test_user, document, outcome="something else")

    assert (await db_session.execute(select(AnswerTrace))).first() is None


async def test_the_lists_of_clause_ids_are_capped(db_session, test_user, document):
    many = [f"clause-{n}" for n in range(100)]

    await _record(db_session, test_user, document, retrieved=many, cited=many)

    row = await db_session.scalar(select(AnswerTrace))
    assert len(row.retrieved) == 20 and len(row.cited) == 20
    assert row.retrieved[0] == "clause-0"


class _BrokenSession:
    rolled_back = False

    def add(self, _row):
        pass

    async def commit(self):
        raise RuntimeError("the database is unhappy and says private words")

    async def rollback(self):
        self.rolled_back = True


async def test_a_failure_to_save_never_breaks_the_answer_and_logs_no_details(caplog):
    broken = _BrokenSession()

    with caplog.at_level(logging.WARNING):
        await record_trace(
            broken,
            user_id="u",
            document_id="d",
            kind="ask",
            outcome="answered",
            retrieved=[],
            cited=[],
            elapsed_ms=1,
        )

    assert broken.rolled_back
    assert [record.getMessage() for record in caplog.records] == ["could not record an answer trace"]
    assert "private words" not in caplog.text
