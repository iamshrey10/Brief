import asyncio
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

import app.main as main_module
from app.auth import get_current_user
from app.housekeeping import TRASH_KEPT_FOR, purge_expired_trash, trash_days_left
from app.main import MAX_DOCUMENTS_PER_USER, app
from app.models import Document, User
from tests.conftest import engine
from tests.test_documents_api import (
    LEASE_RENT_TEXT,
    _add_clause,
    _counts,
    _document_with,
    _document_with_everything,
    _fake_checklist_model,
    _ready_document,
)

NOW = datetime(2026, 11, 3, 12, 0, tzinfo=timezone.utc)
EVERYTHING = {"document": 1, "clauses": 1, "embeddings": 1, "key_terms": 1, "checklist": 1}


@pytest_asyncio.fixture
async def client(test_user, monkeypatch):
    async def override_get_current_user():
        return test_user

    monkeypatch.setattr(main_module, "ingest_document", lambda document_id: None)
    app.dependency_overrides[get_current_user] = override_get_current_user
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as async_client:
        yield async_client
    app.dependency_overrides.clear()


@pytest.fixture
def removed_files(monkeypatch) -> list[str]:
    removed: list[str] = []
    monkeypatch.setattr(main_module, "delete_file", lambda key: removed.append(key))
    monkeypatch.setattr("app.housekeeping.delete_file", lambda key: removed.append(key))
    return removed


async def _in_bin_since(db_session, document: Document, days: float) -> None:
    document.deleted_at = datetime.now(timezone.utc) - timedelta(days=days)
    await db_session.commit()


# --- moving a document to the bin ---


async def test_delete_moves_a_document_to_the_bin_and_removes_nothing(client, db_session, test_user, removed_files):
    document = await _document_with_everything(db_session, test_user, key="fake/mine.pdf")
    document_id = document.id

    response = await client.delete(f"/documents/{document_id}")

    assert response.status_code == 204
    assert removed_files == []  # the file is still in storage
    db_session.expire_all()
    assert await _counts(db_session, document_id) == EVERYTHING  # and everything read from it is still there
    stored = await db_session.get(Document, document_id)
    assert stored.deleted_at is not None
    assert abs((datetime.now(timezone.utc) - stored.deleted_at).total_seconds()) < 60


async def test_a_document_in_the_bin_is_not_there_for_anything_else(client, db_session, test_user, removed_files):
    document = await _document_with(db_session, test_user, "ready")
    await client.delete(f"/documents/{document.id}")
    path = f"/documents/{document.id}"

    assert [d["id"] for d in (await client.get("/documents")).json()] == []
    for method, url, body in [
        ("GET", path, None),
        ("GET", f"{path}/clauses", None),
        ("GET", f"{path}/key-terms", None),
        ("GET", f"{path}/checklist", None),
        ("POST", f"{path}/ask", {"question": "What is the rent?"}),
        ("POST", f"{path}/retry", None),
        ("POST", f"{path}/reread", None),
        ("PATCH", f"{path}/confirm", None),
        ("PATCH", path, {"filename": "new.pdf"}),
        ("DELETE", path, None),
    ]:
        response = await client.request(method, url, json=body)
        assert response.status_code == 404, f"{method} {url} answered {response.status_code}"


async def test_moving_a_document_to_the_bin_leaves_every_other_document_alone(client, db_session, test_user, removed_files):
    doomed = await _document_with(db_session, test_user, "ready")
    doomed_id = doomed.id
    kept = await _document_with_everything(db_session, test_user, "kept.pdf", "fake/kept.pdf")
    kept_id = kept.id

    await client.delete(f"/documents/{doomed_id}")

    db_session.expire_all()
    await db_session.refresh(test_user)
    assert await _counts(db_session, kept_id) == EVERYTHING
    assert [d["filename"] for d in (await client.get("/documents")).json()] == ["kept.pdf"]


async def test_another_persons_document_cannot_be_moved_to_the_bin(client, db_session, removed_files):
    other = User(email=f"{uuid.uuid4()}@example.com")
    db_session.add(other)
    await db_session.flush()
    theirs = await _document_with_everything(db_session, other)
    theirs_id = theirs.id

    response = await client.delete(f"/documents/{theirs_id}")

    assert response.status_code == 404
    db_session.expire_all()
    assert (await db_session.get(Document, theirs_id)).deleted_at is None


# --- the bin ---


async def test_the_bin_lists_what_was_moved_there_newest_first_with_the_days_left(client, db_session, test_user, removed_files):
    first = await _document_with(db_session, test_user, "ready")
    first.filename, first.doc_type = "older.pdf", "lease"
    second = await _document_with(db_session, test_user, "ready")
    second.filename, second.doc_type = "newer.pdf", "loan"
    live = await _document_with(db_session, test_user, "ready")
    live.filename = "still-in-use.pdf"
    await db_session.commit()
    await _in_bin_since(db_session, first, 3)
    await _in_bin_since(db_session, second, 0.01)

    response = await client.get("/trash")

    assert response.status_code == 200
    rows = response.json()
    assert [(r["filename"], r["doc_type"], r["days_left"]) for r in rows] == [("newer.pdf", "loan", 7), ("older.pdf", "lease", 4)]
    assert all(datetime.fromisoformat(r["deleted_at"]) for r in rows)


async def test_the_bin_is_empty_for_a_person_who_has_deleted_nothing(client, db_session, test_user):
    await _document_with(db_session, test_user, "ready")

    assert (await client.get("/trash")).json() == []


async def test_the_bin_never_shows_another_persons_documents(client, db_session):
    other = User(email=f"{uuid.uuid4()}@example.com")
    db_session.add(other)
    await db_session.flush()
    theirs = await _document_with(db_session, other, "ready")
    await _in_bin_since(db_session, theirs, 1)

    assert (await client.get("/trash")).json() == []


@pytest.mark.parametrize(
    ("elapsed", "left"),
    [
        (timedelta(0), 7),
        (timedelta(hours=1), 7),
        (timedelta(days=1), 6),
        (timedelta(days=6, hours=12), 1),
        (timedelta(days=6, hours=23, minutes=59), 1),
        (TRASH_KEPT_FOR, 0),
        (timedelta(days=30), 0),
    ],
)
def test_the_days_left_count_a_part_of_a_day_as_a_day_and_never_go_below_zero(elapsed, left):
    assert trash_days_left(NOW - elapsed, NOW) == left


# --- restoring ---


async def test_restore_brings_a_document_back_exactly_as_it_was(client, db_session, test_user, removed_files):
    document = await _document_with_everything(db_session, test_user, "mine.pdf", "fake/mine.pdf")
    document_id = document.id
    document.doc_type = "lease"
    await db_session.commit()
    await client.delete(f"/documents/{document_id}")

    response = await client.post(f"/documents/{document_id}/restore")

    assert response.status_code == 200
    body = response.json()
    assert (body["id"], body["filename"], body["doc_type"]) == (str(document_id), "mine.pdf", "lease")
    assert [d["id"] for d in (await client.get("/documents")).json()] == [str(document_id)]
    assert (await client.get("/trash")).json() == []
    db_session.expire_all()
    assert await _counts(db_session, document_id) == EVERYTHING
    assert removed_files == []


async def test_a_document_that_is_not_in_the_bin_cannot_be_restored(client, db_session, test_user):
    document = await _document_with(db_session, test_user, "ready")

    assert (await client.post(f"/documents/{document.id}/restore")).status_code == 404


async def test_restore_is_refused_when_the_person_already_has_the_most_documents_they_can_keep(client, db_session, test_user, removed_files):
    binned = await _document_with(db_session, test_user, "ready")
    binned_id = binned.id
    await client.delete(f"/documents/{binned_id}")
    for _ in range(MAX_DOCUMENTS_PER_USER):
        await _document_with(db_session, test_user, "ready")

    refused = await client.post(f"/documents/{binned_id}/restore")

    assert refused.status_code == 409
    assert str(MAX_DOCUMENTS_PER_USER) in refused.json()["detail"]
    assert [row["id"] for row in (await client.get("/trash")).json()] == [str(binned_id)]  # still safe in the bin
    some = (await client.get("/documents")).json()[0]["id"]
    await client.delete(f"/documents/{some}")
    assert (await client.post(f"/documents/{binned_id}/restore")).status_code == 200


async def test_documents_in_the_bin_do_not_use_up_a_place(db_session, test_user):
    documents = [await _document_with(db_session, test_user, "ready") for _ in range(3)]
    assert await main_module._live_document_count(db_session, test_user) == 3

    await _in_bin_since(db_session, documents[0], 1)

    assert await main_module._live_document_count(db_session, test_user) == 2


async def test_a_document_past_its_seven_days_cannot_be_restored(client, db_session, test_user):
    document = await _document_with(db_session, test_user, "ready")
    await _in_bin_since(db_session, document, 8)

    assert (await client.post(f"/documents/{document.id}/restore")).status_code == 404


async def test_another_persons_binned_document_cannot_be_restored(client, db_session):
    other = User(email=f"{uuid.uuid4()}@example.com")
    db_session.add(other)
    await db_session.flush()
    theirs = await _document_with(db_session, other, "ready")
    theirs_id = theirs.id
    await _in_bin_since(db_session, theirs, 1)

    assert (await client.post(f"/documents/{theirs_id}/restore")).status_code == 404
    db_session.expire_all()
    assert (await db_session.get(Document, theirs_id)).deleted_at is not None


# --- deleting for good ---


async def test_a_document_in_use_cannot_be_deleted_for_good_by_one_call(client, db_session, test_user, removed_files):
    document = await _document_with_everything(db_session, test_user)
    document_id = document.id

    response = await client.delete(f"/documents/{document_id}/permanent")

    assert response.status_code == 404
    assert removed_files == []
    db_session.expire_all()
    assert await _counts(db_session, document_id) == EVERYTHING


async def test_deleting_from_the_bin_removes_the_file_then_everything_else(client, db_session, test_user, removed_files):
    document = await _document_with_everything(db_session, test_user, key="fake/gone.pdf")
    document_id = document.id
    await client.delete(f"/documents/{document_id}")

    response = await client.delete(f"/documents/{document_id}/permanent")

    assert response.status_code == 204
    assert removed_files == ["fake/gone.pdf"]
    db_session.expire_all()
    assert await _counts(db_session, document_id) == {"document": 0, "clauses": 0, "embeddings": 0, "key_terms": 0, "checklist": 0}


async def test_another_persons_binned_document_cannot_be_deleted_for_good(client, db_session, removed_files):
    other = User(email=f"{uuid.uuid4()}@example.com")
    db_session.add(other)
    await db_session.flush()
    theirs = await _document_with(db_session, other, "ready")
    theirs_id = theirs.id
    await _in_bin_since(db_session, theirs, 1)

    assert (await client.delete(f"/documents/{theirs_id}/permanent")).status_code == 404
    assert removed_files == []


async def test_a_malformed_id_is_a_404_for_restore_and_for_deleting_for_good(client):
    assert (await client.post("/documents/not-a-uuid/restore")).status_code == 404
    assert (await client.delete("/documents/not-a-uuid/permanent")).status_code == 404


async def test_deleting_the_account_takes_the_bin_with_it(client, db_session, test_user, removed_files):
    document = await _document_with_everything(db_session, test_user, key="fake/binned.pdf")
    document_id = document.id
    await client.delete(f"/documents/{document_id}")

    response = await client.delete("/me")

    assert response.status_code == 204
    assert removed_files == ["fake/binned.pdf"]
    db_session.expire_all()
    assert (await _counts(db_session, document_id))["document"] == 0


# --- what a person sees elsewhere ---


async def test_a_document_in_the_bin_leaves_the_insights_and_comes_back_with_them(client, db_session, test_user, monkeypatch, removed_files):
    document = await _ready_document(db_session, test_user)
    await _add_clause(db_session, document, 0, 1, LEASE_RENT_TEXT)
    await db_session.commit()
    document_id = document.id

    def rent(fields, clauses, seed=None):
        from app.key_terms import ExtractedField, ExtractionResponse

        return ExtractionResponse(
            fields=[ExtractedField(name="monthly_rent", found=True, value="$2,054.00 a month", clause_ref="C1", quote="Monthly rent is $2,054.00")]
        )

    monkeypatch.setattr("app.key_terms.generate_key_terms", rent)
    _fake_checklist_model(monkeypatch, [])
    await client.get(f"/documents/{document_id}/key-terms")
    assert len((await client.get("/me/insights")).json()) == 1

    await client.delete(f"/documents/{document_id}")
    assert (await client.get("/me/insights")).json() == []
    assert (await client.get("/me/key-dates")).json() == []

    await client.post(f"/documents/{document_id}/restore")
    assert len((await client.get("/me/insights")).json()) == 1


# --- removing what has been in the bin too long ---


async def test_the_purge_removes_only_what_has_been_in_the_bin_longer_than_it_is_kept(db_session, test_user, removed_files):
    expired = await _document_with_everything(db_session, test_user, "expired.pdf", "fake/expired.pdf")
    expired_id = expired.id
    fresh = await _document_with_everything(db_session, test_user, "fresh.pdf", "fake/fresh.pdf")
    fresh_id = fresh.id
    live = await _document_with_everything(db_session, test_user, "live.pdf", "fake/live.pdf")
    live_id = live.id
    await _in_bin_since(db_session, expired, 7.5)
    await _in_bin_since(db_session, fresh, 6.5)

    removed = await purge_expired_trash(db_session)

    assert removed == 1
    assert removed_files == ["fake/expired.pdf"]
    db_session.expire_all()
    assert (await _counts(db_session, expired_id))["document"] == 0
    assert await _counts(db_session, fresh_id) == EVERYTHING
    assert await _counts(db_session, live_id) == EVERYTHING


async def test_the_purge_for_one_person_leaves_everyone_elses_alone(db_session, test_user, removed_files):
    other = User(email=f"{uuid.uuid4()}@example.com")
    db_session.add(other)
    await db_session.flush()
    mine = await _document_with(db_session, test_user, "ready")
    mine_id = mine.id
    theirs = await _document_with(db_session, other, "ready")
    theirs_id = theirs.id
    await _in_bin_since(db_session, mine, 9)
    await _in_bin_since(db_session, theirs, 9)

    assert await purge_expired_trash(db_session, user_id=test_user.id) == 1

    db_session.expire_all()
    assert await db_session.get(Document, mine_id) is None
    assert await db_session.get(Document, theirs_id) is not None


async def test_the_purge_keeps_a_document_whose_file_cannot_be_removed_and_tries_again_next_time(db_session, test_user, monkeypatch):
    document = await _document_with(db_session, test_user, "ready")
    document_id = document.id
    await _in_bin_since(db_session, document, 9)
    attempts = {"n": 0}

    def flaky(key):
        attempts["n"] += 1
        if attempts["n"] == 1:
            raise RuntimeError("storage is down")

    monkeypatch.setattr("app.housekeeping.delete_file", flaky)

    assert await purge_expired_trash(db_session) == 0
    assert await db_session.get(Document, document_id) is not None  # no record without its file, no file without its record
    assert await purge_expired_trash(db_session) == 1


async def test_opening_the_bin_first_removes_that_persons_expired_documents(client, db_session, test_user, removed_files):
    expired = await _document_with(db_session, test_user, "ready")
    expired_id = expired.id
    await _in_bin_since(db_session, expired, 8)
    recent = await _document_with(db_session, test_user, "ready")
    recent.filename = "recent.pdf"
    await _in_bin_since(db_session, recent, 1)

    rows = (await client.get("/trash")).json()

    assert [r["filename"] for r in rows] == ["recent.pdf"]
    db_session.expire_all()
    assert await db_session.get(Document, expired_id) is None
    assert removed_files == ["fake/doc.pdf"]


async def test_the_hourly_sweep_removes_expired_documents_for_everyone_and_keeps_going_after_a_failure(db_session, test_user, monkeypatch, removed_files):
    document = await _document_with(db_session, test_user, "ready")
    document_id = document.id
    await _in_bin_since(db_session, document, 10)
    monkeypatch.setattr(main_module, "async_session", async_sessionmaker(engine, expire_on_commit=False))
    sleeps: list[int] = []

    async def stop_after_two_rounds(seconds):
        sleeps.append(seconds)
        if len(sleeps) == 2:
            raise asyncio.CancelledError

    monkeypatch.setattr(main_module.asyncio, "sleep", stop_after_two_rounds)
    real = main_module.purge_expired_trash
    calls = {"n": 0}

    async def fails_once(session, *args, **kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("the database blinked")
        return await real(session, *args, **kwargs)

    monkeypatch.setattr(main_module, "purge_expired_trash", fails_once)

    with pytest.raises(asyncio.CancelledError):
        await main_module.sweep_trash_forever()

    assert sleeps == [main_module.TRASH_SWEEP_EVERY_SECONDS] * 2  # the first round failed, and it still waited and went on
    async with async_sessionmaker(engine)() as session:
        assert (await session.execute(select(Document).where(Document.id == document_id))).scalar_one_or_none() is None


async def test_the_sweep_starts_with_the_server_and_stops_with_it(monkeypatch):
    started = asyncio.Event()
    cancelled = asyncio.Event()

    async def fake_sweep():
        started.set()
        try:
            await asyncio.sleep(3600)
        except asyncio.CancelledError:
            cancelled.set()
            raise

    monkeypatch.setattr(main_module, "sweep_trash_forever", fake_sweep)

    async with main_module.lifespan(app):
        await asyncio.wait_for(started.wait(), 5)
        assert not cancelled.is_set()

    assert cancelled.is_set()
