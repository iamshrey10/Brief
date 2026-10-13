import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app import housekeeping
from app.housekeeping import ABANDONED_AFTER, remove_abandoned_uploads
from app.models import Document, User

NOW = datetime(2026, 10, 12, 12, 0, tzinfo=timezone.utc)


async def make_document(db_session, user, status="pending", age=timedelta(hours=3), key=None):
    document = Document(
        user_id=user.id,
        filename="lease.pdf",
        doc_type="lease",
        status=status,
        storage_key=key or f"{user.id}/{uuid.uuid4()}-lease.pdf",
        file_size_bytes=1024,
        content_type="application/pdf",
        created_at=NOW - age,
    )
    db_session.add(document)
    await db_session.commit()
    await db_session.refresh(document)
    return document


@pytest.fixture
def removed_files(monkeypatch) -> list[str]:
    removed: list[str] = []
    monkeypatch.setattr(housekeeping, "delete_file", lambda key: removed.append(key))
    return removed


async def remaining_ids(db_session) -> set[uuid.UUID]:
    return set((await db_session.execute(select(Document.id))).scalars().all())


async def test_an_upload_never_confirmed_is_removed_with_its_file(db_session, test_user, removed_files):
    old = await make_document(db_session, test_user, key="user/old.pdf")
    old_id = old.id

    count = await remove_abandoned_uploads(db_session, test_user.id, now=NOW)

    assert count == 1
    assert removed_files == ["user/old.pdf"]
    assert old_id not in await remaining_ids(db_session)


async def test_an_upload_that_may_still_be_in_progress_is_kept(db_session, test_user, removed_files):
    fresh = await make_document(db_session, test_user, age=ABANDONED_AFTER - timedelta(minutes=1))

    count = await remove_abandoned_uploads(db_session, test_user.id, now=NOW)

    assert count == 0
    assert removed_files == []
    assert fresh.id in await remaining_ids(db_session)


async def test_the_line_is_just_past_the_allowed_time(db_session, test_user, removed_files):
    exactly = await make_document(db_session, test_user, age=ABANDONED_AFTER)
    just_over = await make_document(db_session, test_user, age=ABANDONED_AFTER + timedelta(seconds=1))
    exactly_id, just_over_id = exactly.id, just_over.id

    await remove_abandoned_uploads(db_session, test_user.id, now=NOW)

    remaining = await remaining_ids(db_session)
    assert exactly_id in remaining and just_over_id not in remaining


@pytest.mark.parametrize("status", ["uploaded", "processing", "ready", "needs_retake", "failed"])
async def test_a_document_that_was_confirmed_is_never_removed_however_old(
    db_session, test_user, removed_files, status
):
    document = await make_document(db_session, test_user, status=status, age=timedelta(days=90))

    assert await remove_abandoned_uploads(db_session, test_user.id, now=NOW) == 0
    assert document.id in await remaining_ids(db_session)
    assert removed_files == []


async def test_only_the_given_persons_uploads_are_touched(db_session, test_user, removed_files):
    other = User(email="someone-else-housekeeping@example.com")
    db_session.add(other)
    await db_session.commit()
    theirs = await make_document(db_session, other)
    mine = await make_document(db_session, test_user)
    theirs_id, mine_id = theirs.id, mine.id

    await remove_abandoned_uploads(db_session, test_user.id, now=NOW)

    remaining = await remaining_ids(db_session)
    assert theirs_id in remaining and mine_id not in remaining


async def test_a_file_that_cannot_be_removed_keeps_its_record_and_the_rest_still_go(
    db_session, test_user, monkeypatch
):
    deleted: list[str] = []

    def flaky(key):
        if key == "user/stuck.pdf":
            raise RuntimeError("storage is down")
        deleted.append(key)

    monkeypatch.setattr(housekeeping, "delete_file", flaky)
    stuck = await make_document(db_session, test_user, key="user/stuck.pdf")
    fine = await make_document(db_session, test_user, key="user/fine.pdf")
    stuck_id, fine_id = stuck.id, fine.id

    count = await remove_abandoned_uploads(db_session, test_user.id, now=NOW)

    assert count == 1
    assert deleted == ["user/fine.pdf"]
    remaining = await remaining_ids(db_session)
    assert stuck_id in remaining  # kept, so nothing is orphaned, and it is tried again next time
    assert fine_id not in remaining


async def test_running_it_again_finds_nothing_more(db_session, test_user, removed_files):
    await make_document(db_session, test_user)
    await make_document(db_session, test_user)

    first = await remove_abandoned_uploads(db_session, test_user.id, now=NOW)
    second = await remove_abandoned_uploads(db_session, test_user.id, now=NOW)

    assert (first, second) == (2, 0)


async def test_the_time_is_taken_from_the_clock_when_none_is_given(db_session, test_user, removed_files):
    anciently_old = await make_document(db_session, test_user, age=timedelta(days=400))
    anciently_old_id = anciently_old.id

    assert await remove_abandoned_uploads(db_session, test_user.id) == 1
    assert anciently_old_id not in await remaining_ids(db_session)


def test_the_allowed_time_is_longer_than_an_upload_link_lives():
    from app.storage import PRESIGNED_URL_EXPIRY_SECONDS

    assert ABANDONED_AFTER.total_seconds() > 3 * PRESIGNED_URL_EXPIRY_SECONDS
