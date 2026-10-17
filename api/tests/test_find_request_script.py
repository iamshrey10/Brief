import pytest

from app import request_id
from app.models import Document
from app.traces import record_trace
from scripts.find_request import run


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


async def _save(db_session, user, document, request, outcome="withheld"):
    token = request_id.current.set(request)
    try:
        await record_trace(
            db_session,
            user_id=user.id,
            document_id=document.id,
            kind="ask",
            outcome=outcome,
            retrieved=["clause-a", "clause-b", "clause-c"],
            cited=["clause-b"],
            elapsed_ms=2345,
        )
    finally:
        request_id.current.reset(token)


async def test_it_prints_what_the_answer_used_and_exits_zero(db_session, test_user, document):
    await _save(db_session, test_user, document, "3f2b8c1e-9d4a-4e07-8a55-0c1d2e3f4a5b")

    code, text = await run("3f2b8c1e", db_session)

    assert code == 0
    assert "3f2b8c1e-9d4a-4e07-8a55-0c1d2e3f4a5b" in text
    assert "ask" in text and "withheld" in text and "2345" in text
    assert "3 shown" in text and "1 cited" in text
    assert "clause-a" in text and "clause-b" in text
    assert str(document.id) in text and str(test_user.id) in text


async def test_it_says_so_and_exits_one_when_nothing_matches(db_session, test_user, document):
    await _save(db_session, test_user, document, "3f2b8c1e-9d4a-4e07-8a55-0c1d2e3f4a5b")

    code, text = await run("deadbeef", db_session)

    assert code == 1
    assert "No trace found" in text


async def test_it_refuses_a_reference_that_is_not_one_and_exits_two(db_session):
    code, text = await run("%", db_session)

    assert code == 2
    assert "reference" in text.lower()


async def test_it_prints_every_match_when_a_prefix_matches_several(db_session, test_user, document):
    await _save(db_session, test_user, document, "aaaaaaaa-0000-0000-0000-000000000001")
    await _save(db_session, test_user, document, "aaaaaaaa-0000-0000-0000-000000000002", outcome="answered")

    code, text = await run("aaaaaaaa", db_session)

    assert code == 0
    assert text.count("aaaaaaaa-0000-0000-0000-00000000000") == 2
