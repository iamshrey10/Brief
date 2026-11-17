import datetime as dt
import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, func, select

from app import reminders
from app.auth import get_current_user
from app.main import app
from app.models import Document, Reminder, User

SOON = (dt.date.today() + dt.timedelta(days=30)).isoformat()


@pytest_asyncio.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as async_client:
        yield async_client
    app.dependency_overrides.clear()


def act_as(user: User) -> None:
    async def current():
        return user

    app.dependency_overrides[get_current_user] = current


async def make_user(db_session, label: str = "person") -> User:
    user = User(email=f"{label}-{uuid.uuid4()}@example.com")
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


async def make_document(db_session, owner: User, name: str = "lease.pdf", deleted: bool = False) -> Document:
    document = Document(
        user_id=owner.id,
        filename=name,
        doc_type="lease",
        status="ready",
        storage_key=f"fake/{uuid.uuid4()}.pdf",
        file_size_bytes=1024,
        deleted_at=dt.datetime.now(dt.timezone.utc) if deleted else None,
    )
    db_session.add(document)
    await db_session.commit()
    await db_session.refresh(document)
    return document


async def add(client, owner: User, **fields) -> dict:
    act_as(owner)
    body = {"title": "Call the landlord", "due_date": SOON, **fields}
    response = await client.post("/me/reminders", json=body)
    assert response.status_code == 201, response.text
    return response.json()


# --- creating ---


async def test_a_reminder_needs_no_document(client, db_session):
    me = await make_user(db_session)

    made = await add(client, me)

    assert made["title"] == "Call the landlord"
    assert made["due_date"] == SOON
    assert made["due_time"] is None
    assert made["description"] is None
    assert made["document_id"] is None and made["document_name"] is None
    assert made["completed"] is False and made["completed_at"] is None


async def test_a_reminder_can_have_a_time_a_note_and_one_of_my_documents(client, db_session):
    me = await make_user(db_session)
    document = await make_document(db_session, me, "my-lease.pdf")

    made = await add(client, me, due_time="09:30", description="  Ask about the deposit  ", document_id=str(document.id))

    assert made["due_time"] == "09:30"
    assert made["description"] == "Ask about the deposit"
    assert made["document_id"] == str(document.id)
    assert made["document_name"] == "my-lease.pdf"


async def test_the_time_is_kept_to_the_minute(client, db_session):
    me = await make_user(db_session)

    made = await add(client, me, due_time="17:45:59")

    assert made["due_time"] == "17:45"


async def test_the_title_is_tidied_and_must_not_be_empty(client, db_session):
    me = await make_user(db_session)
    act_as(me)

    tidy = await add(client, me, title="   Renew   the   lease  ")
    blank = await client.post("/me/reminders", json={"title": "   ", "due_date": SOON})

    assert tidy["title"] == "Renew the lease"
    assert blank.status_code == 422
    assert blank.json()["detail"] == "Give the reminder a title."


async def test_a_title_or_note_that_is_too_long_is_refused_with_a_clear_message(client, db_session):
    me = await make_user(db_session)
    act_as(me)

    long_title = await client.post("/me/reminders", json={"title": "x" * 121, "due_date": SOON})
    long_note = await client.post("/me/reminders", json={"title": "ok", "due_date": SOON, "description": "y" * 501})

    assert long_title.status_code == 422 and "120" in long_title.json()["detail"]
    assert long_note.status_code == 422 and "500" in long_note.json()["detail"]


@pytest.mark.parametrize("bad", ["2026-02-30", "not a date", "2026-13-01", "", "31/12/2026"])
async def test_a_date_that_is_not_a_real_date_is_refused(client, db_session, bad):
    me = await make_user(db_session)
    act_as(me)

    response = await client.post("/me/reminders", json={"title": "x", "due_date": bad})

    assert response.status_code == 422
    assert await _count(db_session, me) == 0


async def test_a_missing_date_is_refused(client, db_session):
    me = await make_user(db_session)
    act_as(me)

    response = await client.post("/me/reminders", json={"title": "x"})

    assert response.status_code == 422


@pytest.mark.parametrize("year", [1970, 1999, 2206, 9999])
async def test_a_date_far_outside_a_sensible_range_is_refused(client, db_session, year):
    me = await make_user(db_session)
    act_as(me)

    response = await client.post("/me/reminders", json={"title": "x", "due_date": f"{year}-06-15"})

    assert response.status_code == 422
    assert "Choose a date between" in response.json()["detail"]


async def test_a_date_in_the_past_is_allowed_and_kept(client, db_session):
    me = await make_user(db_session)
    yesterday = (dt.date.today() - dt.timedelta(days=1)).isoformat()

    made = await add(client, me, due_date=yesterday)

    assert made["due_date"] == yesterday


@pytest.mark.parametrize("bad", ["25:00", "9", "noon", "12:61"])
async def test_a_time_that_is_not_a_real_time_is_refused(client, db_session, bad):
    me = await make_user(db_session)
    act_as(me)

    response = await client.post("/me/reminders", json={"title": "x", "due_date": SOON, "due_time": bad})

    assert response.status_code == 422


async def test_a_reminder_cannot_be_linked_to_someone_elses_document(client, db_session):
    me = await make_user(db_session, "me")
    other = await make_user(db_session, "other")
    theirs = await make_document(db_session, other)
    act_as(me)

    response = await client.post("/me/reminders", json={"title": "x", "due_date": SOON, "document_id": str(theirs.id)})

    assert response.status_code == 404
    assert await _count(db_session, me) == 0


@pytest.mark.parametrize("bad", ["not-an-id", str(uuid.uuid4()), ""])
async def test_a_reminder_cannot_be_linked_to_a_document_that_does_not_exist(client, db_session, bad):
    me = await make_user(db_session)
    act_as(me)

    response = await client.post("/me/reminders", json={"title": "x", "due_date": SOON, "document_id": bad})

    assert response.status_code == 404


async def test_a_reminder_cannot_be_linked_to_a_document_in_the_bin(client, db_session):
    me = await make_user(db_session)
    binned = await make_document(db_session, me, deleted=True)
    act_as(me)

    response = await client.post("/me/reminders", json={"title": "x", "due_date": SOON, "document_id": str(binned.id)})

    assert response.status_code == 404


async def test_a_person_can_keep_only_so_many_reminders(client, db_session):
    me = await make_user(db_session)
    db_session.add_all(
        [Reminder(user_id=me.id, title=f"r{i}", due_date=dt.date.today()) for i in range(reminders.MAX_REMINDERS)]
    )
    await db_session.commit()
    act_as(me)

    response = await client.post("/me/reminders", json={"title": "one too many", "due_date": SOON})

    assert response.status_code == 409
    assert str(reminders.MAX_REMINDERS) in response.json()["detail"]
    assert await _count(db_session, me) == reminders.MAX_REMINDERS


# --- listing ---


async def test_reminders_are_listed_soonest_first_with_the_timed_one_before_the_untimed_on_the_same_day(client, db_session):
    me = await make_user(db_session)
    later = (dt.date.today() + dt.timedelta(days=40)).isoformat()
    await add(client, me, title="later", due_date=later)
    await add(client, me, title="untimed", due_date=SOON)
    await add(client, me, title="timed", due_date=SOON, due_time="08:00")

    act_as(me)
    titles = [item["title"] for item in (await client.get("/me/reminders")).json()]

    assert titles == ["timed", "untimed", "later"]


async def test_the_list_is_empty_for_someone_with_no_reminders(client, db_session):
    me = await make_user(db_session)
    act_as(me)

    response = await client.get("/me/reminders")

    assert response.status_code == 200 and response.json() == []


async def test_a_person_only_ever_sees_their_own_reminders(client, db_session):
    me = await make_user(db_session, "me")
    other = await make_user(db_session, "other")
    await add(client, me, title="mine")
    await add(client, other, title="theirs")

    act_as(me)
    mine = (await client.get("/me/reminders")).json()
    act_as(other)
    theirs = (await client.get("/me/reminders")).json()

    assert [item["title"] for item in mine] == ["mine"]
    assert [item["title"] for item in theirs] == ["theirs"]


async def test_the_list_needs_a_signed_in_person(client):
    response = await client.get("/me/reminders")

    assert response.status_code == 401


async def test_every_route_needs_a_signed_in_person(client):
    some = str(uuid.uuid4())

    assert (await client.post("/me/reminders", json={"title": "x", "due_date": SOON})).status_code == 401
    assert (await client.patch(f"/me/reminders/{some}", json={"completed": True})).status_code == 401
    assert (await client.delete(f"/me/reminders/{some}")).status_code == 401


# --- changing ---


async def test_a_reminder_can_be_edited_and_only_what_is_sent_changes(client, db_session):
    me = await make_user(db_session)
    made = await add(client, me, due_time="10:00", description="note")
    later = (dt.date.today() + dt.timedelta(days=60)).isoformat()
    act_as(me)

    response = await client.patch(f"/me/reminders/{made['id']}", json={"title": "Renew the lease", "due_date": later})

    changed = response.json()
    assert response.status_code == 200
    assert changed["title"] == "Renew the lease" and changed["due_date"] == later
    assert changed["due_time"] == "10:00" and changed["description"] == "note"


async def test_sending_null_clears_the_time_the_note_and_the_document(client, db_session):
    me = await make_user(db_session)
    document = await make_document(db_session, me)
    made = await add(client, me, due_time="10:00", description="note", document_id=str(document.id))
    act_as(me)

    response = await client.patch(f"/me/reminders/{made['id']}", json={"due_time": None, "description": None, "document_id": None})

    cleared = response.json()
    assert cleared["due_time"] is None and cleared["description"] is None
    assert cleared["document_id"] is None and cleared["document_name"] is None


async def test_a_reminder_can_be_linked_to_a_document_later(client, db_session):
    me = await make_user(db_session)
    document = await make_document(db_session, me, "loan.pdf")
    made = await add(client, me)
    act_as(me)

    response = await client.patch(f"/me/reminders/{made['id']}", json={"document_id": str(document.id)})

    assert response.json()["document_name"] == "loan.pdf"


async def test_a_reminder_can_be_completed_and_reopened(client, db_session):
    me = await make_user(db_session)
    made = await add(client, me)
    act_as(me)

    done = (await client.patch(f"/me/reminders/{made['id']}", json={"completed": True})).json()
    reopened = (await client.patch(f"/me/reminders/{made['id']}", json={"completed": False})).json()

    assert done["completed"] is True and done["completed_at"] is not None
    assert reopened["completed"] is False and reopened["completed_at"] is None


async def test_completing_twice_keeps_the_first_moment_it_was_done(client, db_session):
    me = await make_user(db_session)
    made = await add(client, me)
    act_as(me)

    first = (await client.patch(f"/me/reminders/{made['id']}", json={"completed": True})).json()
    second = (await client.patch(f"/me/reminders/{made['id']}", json={"completed": True})).json()

    assert first["completed_at"] == second["completed_at"]


async def test_a_change_that_is_not_allowed_leaves_the_reminder_exactly_as_it_was(client, db_session):
    me = await make_user(db_session)
    made = await add(client, me, title="keep me", description="note")
    act_as(me)

    blank = await client.patch(f"/me/reminders/{made['id']}", json={"description": "changed", "title": "  "})
    far = await client.patch(f"/me/reminders/{made['id']}", json={"title": "changed", "due_date": "2300-01-01"})
    null_title = await client.patch(f"/me/reminders/{made['id']}", json={"title": None})
    null_date = await client.patch(f"/me/reminders/{made['id']}", json={"due_date": None})

    assert [r.status_code for r in (blank, far, null_title, null_date)] == [422, 422, 422, 422]
    after = (await client.get("/me/reminders")).json()[0]
    assert after["title"] == "keep me" and after["description"] == "note" and after["due_date"] == SOON


async def test_an_empty_change_changes_nothing(client, db_session):
    me = await make_user(db_session)
    made = await add(client, me)
    act_as(me)

    response = await client.patch(f"/me/reminders/{made['id']}", json={})

    assert response.status_code == 200 and response.json()["title"] == made["title"]


async def test_nobody_can_change_someone_elses_reminder(client, db_session):
    me = await make_user(db_session, "me")
    other = await make_user(db_session, "other")
    theirs = await add(client, other, title="theirs")
    act_as(me)

    edit = await client.patch(f"/me/reminders/{theirs['id']}", json={"title": "hijacked"})
    done = await client.patch(f"/me/reminders/{theirs['id']}", json={"completed": True})

    assert edit.status_code == 404 and done.status_code == 404
    act_as(other)
    after = (await client.get("/me/reminders")).json()[0]
    assert after["title"] == "theirs" and after["completed"] is False


@pytest.mark.parametrize("bad", ["not-an-id", "123", str(uuid.uuid4())])
async def test_a_reminder_that_does_not_exist_is_not_found(client, db_session, bad):
    me = await make_user(db_session)
    act_as(me)

    assert (await client.patch(f"/me/reminders/{bad}", json={"completed": True})).status_code == 404
    assert (await client.delete(f"/me/reminders/{bad}")).status_code == 404


async def test_a_change_cannot_link_someone_elses_document(client, db_session):
    me = await make_user(db_session, "me")
    other = await make_user(db_session, "other")
    theirs = await make_document(db_session, other)
    made = await add(client, me)
    act_as(me)

    response = await client.patch(f"/me/reminders/{made['id']}", json={"document_id": str(theirs.id)})

    assert response.status_code == 404
    assert (await client.get("/me/reminders")).json()[0]["document_id"] is None


# --- deleting ---


async def test_a_reminder_can_be_deleted_and_stays_deleted(client, db_session):
    me = await make_user(db_session)
    document = await make_document(db_session, me)
    made = await add(client, me, document_id=str(document.id))
    act_as(me)

    gone = await client.delete(f"/me/reminders/{made['id']}")
    again = await client.delete(f"/me/reminders/{made['id']}")

    assert gone.status_code == 204 and again.status_code == 404
    assert (await client.get("/me/reminders")).json() == []
    assert await db_session.get(Document, document.id) is not None  # the document is left alone


async def test_nobody_can_delete_someone_elses_reminder(client, db_session):
    me = await make_user(db_session, "me")
    other = await make_user(db_session, "other")
    theirs = await add(client, other)
    act_as(me)

    response = await client.delete(f"/me/reminders/{theirs['id']}")

    assert response.status_code == 404
    assert await _count(db_session, other) == 1


# --- what happens to a reminder when something around it goes ---


async def test_deleting_a_document_keeps_the_reminder_without_the_link(client, db_session):
    me = await make_user(db_session)
    document = await make_document(db_session, me)
    await add(client, me, document_id=str(document.id))

    await db_session.execute(delete(Document).where(Document.id == document.id))
    await db_session.commit()

    act_as(me)
    [kept] = (await client.get("/me/reminders")).json()
    assert kept["title"] == "Call the landlord"
    assert kept["document_id"] is None and kept["document_name"] is None


async def test_a_document_in_the_bin_is_not_shown_as_a_link_and_comes_back_when_restored(client, db_session):
    me = await make_user(db_session)
    document = await make_document(db_session, me, "lease.pdf")
    await add(client, me, document_id=str(document.id))
    act_as(me)

    document.deleted_at = dt.datetime.now(dt.timezone.utc)
    await db_session.commit()
    binned = (await client.get("/me/reminders")).json()[0]
    document.deleted_at = None
    await db_session.commit()
    restored = (await client.get("/me/reminders")).json()[0]

    assert binned["document_id"] is None and binned["document_name"] is None
    assert restored["document_name"] == "lease.pdf"


async def test_deleting_the_account_removes_the_reminders(client, db_session):
    me = await make_user(db_session, "me")
    other = await make_user(db_session, "other")
    await add(client, me)
    await add(client, other)

    await db_session.execute(delete(User).where(User.id == me.id))
    await db_session.commit()

    assert (await db_session.execute(select(func.count()).select_from(Reminder))).scalar_one() == 1
    assert await _count(db_session, other) == 1


# --- the small pieces ---


def test_check_date_accepts_today_and_the_past_but_not_a_slip_of_the_keyboard():
    today = dt.date(2026, 11, 17)

    assert reminders.check_date(dt.date(2026, 11, 17), today) == today
    assert reminders.check_date(dt.date(2020, 1, 1), today).year == 2020
    assert reminders.check_date(dt.date(2036, 12, 31), today).year == 2036
    for slip in (dt.date(1999, 12, 31), dt.date(2037, 1, 1)):
        with pytest.raises(reminders.BadReminder):
            reminders.check_date(slip, today)


def test_mark_completed_is_idempotent():
    reminder = Reminder(title="x", due_date=dt.date.today())
    first = dt.datetime(2026, 11, 17, 12, 0, tzinfo=dt.timezone.utc)

    reminders.mark_completed(reminder, True, first)
    reminders.mark_completed(reminder, True, first + dt.timedelta(hours=1))
    assert reminder.completed_at == first
    reminders.mark_completed(reminder, False)
    reminders.mark_completed(reminder, False)
    assert reminder.completed_at is None


async def _count(db_session, user: User) -> int:
    result = await db_session.execute(select(func.count()).select_from(Reminder).where(Reminder.user_id == user.id))
    return result.scalar_one()
