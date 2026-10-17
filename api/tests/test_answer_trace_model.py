import pytest
from sqlalchemy import delete, select

from app.models import AnswerTrace, Document, User


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


def _trace(user, document, **overrides) -> AnswerTrace:
    values = dict(
        user_id=user.id,
        document_id=document.id,
        request_id="3f2b8c1e-9d4a-4e07-8a55-0c1d2e3f4a5b",
        kind="ask",
        outcome="answered",
        retrieved=["c1", "c2", "c3"],
        cited=["c2"],
        elapsed_ms=2400,
    )
    values.update(overrides)
    return AnswerTrace(**values)


async def test_a_trace_keeps_what_an_answer_used(db_session, test_user, document):
    db_session.add(_trace(test_user, document))
    await db_session.commit()

    row = await db_session.scalar(select(AnswerTrace))

    assert row.request_id == "3f2b8c1e-9d4a-4e07-8a55-0c1d2e3f4a5b"
    assert (row.kind, row.outcome, row.elapsed_ms) == ("ask", "answered", 2400)
    assert row.retrieved == ["c1", "c2", "c3"]
    assert row.cited == ["c2"]
    assert row.created_at is not None


async def test_a_trace_holds_no_text_of_a_question_an_answer_or_a_document():
    text_like = {"question", "answer", "text", "quote", "filename", "body", "content"}

    assert not text_like & set(AnswerTrace.__table__.columns.keys())


async def test_deleting_the_document_removes_its_traces(db_session, test_user, document):
    db_session.add(_trace(test_user, document))
    await db_session.commit()

    await db_session.execute(delete(Document).where(Document.id == document.id))
    await db_session.commit()

    assert (await db_session.execute(select(AnswerTrace))).first() is None


async def test_deleting_the_person_removes_their_traces_and_no_one_elses(db_session, test_user, document):
    other = User(email="someone-else-trace@example.com")
    db_session.add(other)
    await db_session.commit()
    other_document = Document(
        user_id=other.id,
        filename="o.pdf",
        doc_type="lease",
        status="ready",
        storage_key="fake/other.pdf",
        file_size_bytes=10,
        content_type="application/pdf",
    )
    db_session.add(other_document)
    await db_session.commit()
    db_session.add_all([_trace(test_user, document), _trace(other, other_document, request_id="other-request-id")])
    await db_session.commit()
    mine, other_id = test_user.id, other.id

    await db_session.execute(delete(Document).where(Document.user_id == mine))
    await db_session.execute(delete(User).where(User.id == mine))
    await db_session.commit()

    remaining = (await db_session.execute(select(AnswerTrace.user_id))).scalars().all()
    assert remaining == [other_id]
