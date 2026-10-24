import pytest

from app import request_id
from app.models import Document
from app.traces import record_trace
from scripts.recent_failures import run


@pytest.fixture
async def document(db_session, test_user):
    document = Document(
        user_id=test_user.id, filename="a.pdf", doc_type="lease", status="ready",
        storage_key="k", file_size_bytes=1, content_type="application/pdf",
    )
    db_session.add(document)
    await db_session.commit()
    await db_session.refresh(document)
    return document


async def _save(db_session, user, document, request, outcome, elapsed=100):
    token = request_id.current.set(request)
    try:
        await record_trace(
            db_session, user_id=user.id, document_id=document.id, kind="ask",
            outcome=outcome, retrieved=[], cited=[], elapsed_ms=elapsed,
        )
    finally:
        request_id.current.reset(token)


async def test_it_lists_failed_questions_newest_first_with_their_reference_codes(db_session, test_user, document):
    await _save(db_session, test_user, document, "11111111-0000-0000-0000-000000000001", "failed", 111)
    await _save(db_session, test_user, document, "22222222-0000-0000-0000-000000000002", "failed", 222)
    await _save(db_session, test_user, document, "33333333-0000-0000-0000-000000000003", "answered")

    code, text = await run(db_session)

    assert code == 0
    assert text.index("22222222") < text.index("11111111")
    assert "33333333" not in text and "222ms" in text and str(document.id) in text


async def test_the_outcome_and_the_number_can_be_chosen(db_session, test_user, document):
    for n in range(3):
        await _save(db_session, test_user, document, f"4444444{n}-0000-0000-0000-000000000000", "withheld")

    code, text = await run(db_session, limit=2, outcome="withheld")

    assert code == 0 and len(text.splitlines()) == 3  # a header and two rows


async def test_nothing_to_list_exits_one(db_session):
    code, text = await run(db_session)

    assert (code, text) == (1, "No failed questions saved.")


@pytest.mark.parametrize(("limit", "outcome"), [(0, "failed"), (201, "failed"), (5, "exploded")])
async def test_an_argument_that_makes_no_sense_exits_two(db_session, limit, outcome):
    code, _text = await run(db_session, limit, outcome)

    assert code == 2
