import json
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select

from app import admin
from app.auth import get_current_user
from app.config import settings
from app.main import app
from app.models import Activity, DashboardShare, Document, Usage, User


@pytest_asyncio.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as async_client:
        yield async_client
    app.dependency_overrides.clear()


def act_as(user: User) -> None:
    async def current():
        return user

    app.dependency_overrides[get_current_user] = current


async def person(db_session, email: str | None = None, **fields) -> User:
    user = User(email=email or f"person-{uuid.uuid4()}@example.com", **fields)
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


def named_admin(monkeypatch, *addresses: str) -> None:
    monkeypatch.setattr(settings, "admin_emails", ",".join(addresses))


NOW = datetime(2026, 11, 12, 15, 0, 0, tzinfo=timezone.utc)
TODAY = NOW.date()


# --- who may open it ---
async def test_the_owner_can_open_it(client, db_session, monkeypatch):
    owner = await person(db_session, "owner@example.com")
    named_admin(monkeypatch, "owner@example.com")
    act_as(owner)

    response = await client.get("/admin/stats")

    assert response.status_code == 200
    assert response.json()["people"]["total"] >= 1


async def test_anyone_else_is_told_it_is_not_there(client, db_session, monkeypatch):
    stranger = await person(db_session)
    named_admin(monkeypatch, "owner@example.com")
    act_as(stranger)

    response = await client.get("/admin/stats")

    assert response.status_code == 404
    assert response.json() == {"detail": "not found"}


async def test_with_nobody_named_it_is_closed_to_everyone(client, db_session, monkeypatch):
    anyone = await person(db_session, "owner@example.com")
    named_admin(monkeypatch)
    act_as(anyone)

    assert (await client.get("/admin/stats")).status_code == 404


async def test_a_signed_out_visitor_is_turned_away(client):
    assert (await client.get("/admin/stats")).status_code == 401


@pytest.mark.parametrize("written", ["Owner@Example.com", " owner@example.com ", "a@b.c, OWNER@example.COM ,d@e.f"])
async def test_the_setting_ignores_capitals_and_spaces(client, db_session, monkeypatch, written):
    owner = await person(db_session, "owner@example.com")
    named_admin(monkeypatch, written)
    act_as(owner)

    assert (await client.get("/admin/stats")).status_code == 200


async def test_a_look_like_address_is_not_the_owner(client, db_session, monkeypatch):
    lookalike = await person(db_session, "owner@example.com.evil.test")
    named_admin(monkeypatch, "owner@example.com")
    act_as(lookalike)

    assert (await client.get("/admin/stats")).status_code == 404


async def test_me_says_whether_the_person_is_the_owner(client, db_session, monkeypatch):
    owner, other = await person(db_session, "owner@example.com"), await person(db_session)
    named_admin(monkeypatch, "owner@example.com")

    act_as(owner)
    assert (await client.get("/me")).json()["is_admin"] is True
    act_as(other)
    assert (await client.get("/me")).json()["is_admin"] is False


# --- the time people spend ---
async def _row(db_session, user_id, day=TODAY) -> Activity:
    return await db_session.get(Activity, (user_id, day), populate_existing=True)


async def test_the_first_signal_starts_a_visit_and_counts_no_time(db_session, test_user):
    await admin.record_signal(db_session, test_user.id, NOW)

    row = await _row(db_session, test_user.id)
    assert (row.visits, row.seconds) == (1, 0)


async def test_signals_a_little_apart_add_the_time_between_them(db_session, test_user):
    await admin.record_signal(db_session, test_user.id, NOW)
    await admin.record_signal(db_session, test_user.id, NOW + timedelta(seconds=30))
    await admin.record_signal(db_session, test_user.id, NOW + timedelta(seconds=62))

    row = await _row(db_session, test_user.id)
    assert (row.visits, row.seconds) == (1, 62)


async def test_a_long_gap_starts_a_new_visit_and_the_gap_is_not_counted(db_session, test_user):
    await admin.record_signal(db_session, test_user.id, NOW)
    await admin.record_signal(db_session, test_user.id, NOW + timedelta(seconds=30))
    await admin.record_signal(db_session, test_user.id, NOW + timedelta(hours=3))

    row = await _row(db_session, test_user.id)
    assert (row.visits, row.seconds) == (2, 30)


async def test_one_signal_cannot_add_more_than_a_minute(db_session, test_user):
    await admin.record_signal(db_session, test_user.id, NOW)
    await admin.record_signal(db_session, test_user.id, NOW + timedelta(seconds=119))

    assert (await _row(db_session, test_user.id)).seconds == 60


async def test_each_day_has_its_own_count(db_session, test_user):
    await admin.record_signal(db_session, test_user.id, NOW)
    await admin.record_signal(db_session, test_user.id, NOW + timedelta(days=1))

    assert (await _row(db_session, test_user.id)).visits == 1
    assert (await _row(db_session, test_user.id, TODAY + timedelta(days=1))).visits == 1


async def test_the_browser_sends_a_signal_and_gets_no_content_back(client, db_session, test_user):
    act_as(test_user)

    response = await client.post("/me/activity")

    assert response.status_code == 204
    rows = (await db_session.execute(select(Activity).where(Activity.user_id == test_user.id))).scalars().all()
    assert len(rows) == 1 and rows[0].visits == 1


async def test_a_signed_out_browser_cannot_send_one(client):
    assert (await client.post("/me/activity")).status_code == 401


async def test_the_counts_go_when_the_account_goes(db_session):
    user = await person(db_session)
    await admin.record_signal(db_session, user.id, NOW)

    await db_session.execute(delete(User).where(User.id == user.id))
    await db_session.commit()

    assert (await db_session.execute(select(Activity).where(Activity.user_id == user.id))).first() is None


# --- the numbers ---
async def _document(db_session, user, kind="lease", status="ready", content_type="application/pdf", created=NOW, deleted=None) -> Document:
    document = Document(
        user_id=user.id,
        filename="secret-name.pdf",
        doc_type=kind,
        status=status,
        storage_key="private/key",
        file_size_bytes=10,
        content_type=content_type,
        created_at=created,
        deleted_at=deleted,
    )
    db_session.add(document)
    await db_session.commit()
    return document


async def test_the_people_numbers(db_session):
    await db_session.execute(delete(User))
    await db_session.commit()
    old = await person(db_session, created_at=NOW - timedelta(days=60))
    week = await person(db_session, created_at=NOW - timedelta(days=3))
    today = await person(db_session, created_at=NOW)
    for who, when in ((old, NOW - timedelta(days=20)), (week, NOW - timedelta(days=2)), (today, NOW)):
        await admin.record_signal(db_session, who.id, when)

    people = (await admin.collect(db_session, NOW))["people"]

    assert people == {"total": 3, "new_7_days": 2, "new_30_days": 2, "active_today": 1, "active_7_days": 2, "active_30_days": 3}


async def test_the_time_numbers_are_averages_over_the_week(db_session):
    await db_session.execute(delete(User))
    await db_session.commit()
    a, b = await person(db_session), await person(db_session)
    for who, spans in ((a, (0, 30, 60, 90)), (b, (0, 60))):  # a: 90 s in one visit, b: 60 s in one visit
        for offset in spans:
            await admin.record_signal(db_session, who.id, NOW + timedelta(seconds=offset))

    time_in_brief = (await admin.collect(db_session, NOW))["time_in_brief"]

    assert time_in_brief["visits_7_days"] == 2
    assert time_in_brief["average_minutes_per_visit_7_days"] == 1.2  # 150 seconds over 2 visits is 75 s, 1.25 min, rounded
    assert time_in_brief["average_minutes_per_person_per_day_7_days"] == 1.2


async def test_the_document_numbers_leave_out_the_bin(db_session):
    await db_session.execute(delete(Document))
    await db_session.commit()
    user = await person(db_session)
    await _document(db_session, user, "lease")
    await _document(db_session, user, "lease", status="failed")
    await _document(db_session, user, "loan", content_type="image/jpeg")
    await _document(db_session, user, "offer", created=NOW - timedelta(days=20))
    await _document(db_session, user, "lease", deleted=NOW)  # in the bin

    documents = (await admin.collect(db_session, NOW))["documents"]

    assert documents["stored"] == 4
    assert documents["by_kind"] == {"lease": 2, "loan": 1, "offer": 1}
    assert documents["by_status"] == {"ready": 3, "failed": 1}
    assert documents["photos"] == 1 and documents["pdfs_and_other"] == 3
    assert documents["uploaded_7_days"] == 4  # the one in the bin was still uploaded this week
    assert documents["uploaded_30_days"] == 5


async def test_questions_reads_and_overviews_come_from_the_usage_counts(db_session):
    await db_session.execute(delete(Usage))
    await db_session.commit()
    a, b = await person(db_session), await person(db_session)
    db_session.add_all(
        [
            Usage(user_id=a.id, day=TODAY, kind="ask", count=5),
            Usage(user_id=b.id, day=TODAY, kind="ask", count=2),
            Usage(user_id=a.id, day=TODAY - timedelta(days=3), kind="ask", count=4),
            Usage(user_id=a.id, day=TODAY - timedelta(days=20), kind="ask", count=10),
            Usage(user_id=a.id, day=TODAY, kind="read", count=3),
            Usage(user_id=b.id, day=TODAY, kind="analyze", count=1),
        ]
    )
    await db_session.commit()

    stats = await admin.collect(db_session, NOW)

    assert stats["questions"] == {"asked_total": 21, "asked_today": 7, "asked_7_days": 11}
    assert stats["reads"] == {"total": 3, "today": 3}
    assert stats["overviews"] == {"total": 1, "today": 1}


async def test_why_people_came_is_counted_with_those_who_did_not_say(db_session):
    await db_session.execute(delete(User))
    await db_session.commit()
    for reason in ("lease", "lease", "loan", None):
        await person(db_session, signup_reason=reason)

    assert (await admin.collect(db_session, NOW))["reasons"] == {"lease": 2, "loan": 1, "not_said": 1}


async def test_sharing_is_counted_without_saying_who_shares_with_whom(db_session):
    await db_session.execute(delete(DashboardShare))
    await db_session.commit()
    owner, friend = await person(db_session), await person(db_session)
    for status in ("active", "requested", "revoked"):
        db_session.add(DashboardShare(owner_id=owner.id, viewer_id=friend.id, token_hash=uuid.uuid4().hex, code_hash="c", status=status, expires_at=NOW + timedelta(days=1)))
    await db_session.commit()

    assert (await admin.collect(db_session, NOW))["sharing"] == {"waiting_or_active": 2, "active": 1}


async def test_the_charts_cover_thirty_days_oldest_first_with_gaps_as_zero(db_session):
    await db_session.execute(delete(User))
    await db_session.commit()
    user = await person(db_session, created_at=NOW - timedelta(days=2))
    await admin.record_signal(db_session, user.id, NOW - timedelta(days=1))
    await admin.record_signal(db_session, user.id, NOW - timedelta(days=1, seconds=-45))

    by_day = (await admin.collect(db_session, NOW))["by_day"]

    assert len(by_day) == 30
    assert by_day[-1]["day"] == "2026-11-12" and by_day[0]["day"] == "2026-10-14"
    assert [row["day"] for row in by_day] == sorted(row["day"] for row in by_day)
    yesterday = next(row for row in by_day if row["day"] == "2026-11-11")
    assert yesterday["people"] == 1 and yesterday["minutes"] == 0.8
    assert next(row for row in by_day if row["day"] == "2026-11-10")["signed_up"] == 1
    assert next(row for row in by_day if row["day"] == "2026-11-05") == {"day": "2026-11-05", **{field: 0 for field in admin.DAILY_FIELDS}, "minutes": 0.0}


async def test_with_nothing_yet_every_number_is_zero_and_nothing_breaks(db_session):
    for table in (Activity, Usage, DashboardShare, Document, User):
        await db_session.execute(delete(table))
    await db_session.commit()

    stats = await admin.collect(db_session, NOW)

    assert stats["people"]["total"] == 0
    assert stats["time_in_brief"] == {"average_minutes_per_person_per_day_7_days": 0.0, "average_minutes_per_visit_7_days": 0.0, "visits_7_days": 0}
    assert stats["documents"]["stored"] == 0 and stats["questions"]["asked_total"] == 0
    assert stats["reasons"] == {}


async def test_it_reports_todays_use_of_the_model_against_the_daily_limit(db_session, monkeypatch):
    monkeypatch.setattr(settings, "global_daily_model_calls", 3000)

    site = (await admin.collect(db_session, NOW))["site"]

    assert site["daily_limit"] == 3000
    assert isinstance(site["model_calls_today"], int)


# --- what it must never show ---
async def test_nothing_that_names_a_person_or_a_document_is_in_the_answer(client, db_session, monkeypatch):
    owner = await person(db_session, "owner@example.com", first_name="Zelda", last_name="Quillfeather", signup_reason="lease")
    friend = await person(db_session, "friend-of-owner@example.com", first_name="Borromir", last_name="Underhill")
    named_admin(monkeypatch, "owner@example.com")
    await _document(db_session, friend, "lease")
    await admin.record_signal(db_session, friend.id, datetime.now(timezone.utc))
    db_session.add(DashboardShare(owner_id=owner.id, viewer_id=friend.id, label="Secret label", token_hash=uuid.uuid4().hex, code_hash="c", status="active", expires_at=NOW))
    db_session.add(Usage(user_id=friend.id, day=TODAY, kind="ask", count=1))
    await db_session.commit()
    act_as(owner)

    response = await client.get("/admin/stats")

    assert response.status_code == 200
    text = json.dumps(response.json()).lower()
    for forbidden in ("owner@example.com", "friend-of-owner", "example.com", "zelda", "quillfeather", "borromir", "underhill", "secret-name", "secret label", "private/key", "@"):
        assert forbidden not in text, forbidden


async def test_every_value_in_the_answer_is_a_number_a_day_or_a_fixed_word(client, db_session, monkeypatch):
    owner = await person(db_session, "owner@example.com")
    named_admin(monkeypatch, "owner@example.com")
    act_as(owner)

    body = (await client.get("/admin/stats")).json()

    def walk(value, path=""):
        if isinstance(value, dict):
            for key, inner in value.items():
                walk(inner, f"{path}.{key}")
        elif isinstance(value, list):
            for inner in value:
                walk(inner, path)
        elif isinstance(value, str):
            assert path.endswith((".generated_at", ".day")) or value in {"lease", "loan", "offer", "other", "not_said", "job_offer", "exploring"} or path.rsplit(".", 1)[-1] in {"by_kind", "by_status"}, (path, value)

    walk(body)
