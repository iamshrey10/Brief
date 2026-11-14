import json
import uuid
from datetime import datetime, timedelta, timezone

import jwt
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select

from app import admin
from app.auth import VISITOR_SUBJECT, get_current_user
from app.config import settings
from app.main import app
from app.models import Activity, DashboardShare, Document, SiteEvent, Usage, User

NOW = datetime(2026, 11, 12, 15, 0, 0, tzinfo=timezone.utc)
TODAY = NOW.date()


@pytest_asyncio.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as async_client:
        yield async_client
    app.dependency_overrides.clear()


def token(subject: str) -> dict:
    claims = {"sub": subject, "exp": datetime.now(timezone.utc) + timedelta(seconds=60)}
    return {"Authorization": "Bearer " + jwt.encode(claims, settings.service_jwt_secret, algorithm="HS256")}


async def person(db_session, **fields) -> User:
    user = User(email=f"person-{uuid.uuid4()}@example.com", **fields)
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


async def empty(db_session) -> None:
    for table in (SiteEvent, Usage, Activity, DashboardShare, Document, User):
        await db_session.execute(delete(table))
    await db_session.commit()


def document(user: User, created: datetime, **fields) -> Document:
    return Document(
        user_id=user.id, filename=fields.pop("filename", "lease.pdf"), doc_type="lease", content_type="application/pdf",
        storage_key=f"docs/{uuid.uuid4()}", status="ready", file_size_bytes=10, created_at=created, **fields,
    )


# --- counting something that happened, with nobody attached ---
async def test_the_website_can_count_the_demo_being_opened_and_finished(client, db_session):
    await empty(db_session)

    for name in ("demo_opened", "demo_opened", "demo_finished"):
        assert (await client.post(f"/events/{name}", headers=token(VISITOR_SUBJECT))).status_code == 204

    rows = {row.name: row.count for row in (await db_session.execute(select(SiteEvent))).scalars()}
    assert rows == {"demo_opened": 2, "demo_finished": 1}


async def test_a_name_that_is_not_on_the_list_is_refused_and_nothing_is_kept(client, db_session):
    await empty(db_session)

    response = await client.post("/events/something_else", headers=token(VISITOR_SUBJECT))

    assert response.status_code == 404
    assert (await db_session.execute(select(SiteEvent))).scalars().all() == []


@pytest.mark.parametrize("headers", [{}, {"Authorization": "Bearer nonsense"}, token("someone@example.com")])
async def test_only_the_website_for_a_visitor_may_count_it(client, db_session, headers):
    await empty(db_session)

    response = await client.post("/events/demo_opened", headers=headers)

    assert response.status_code == 401
    assert (await db_session.execute(select(SiteEvent))).scalars().all() == []


async def test_a_token_signed_with_another_secret_is_refused(client):
    claims = {"sub": VISITOR_SUBJECT, "exp": datetime.now(timezone.utc) + timedelta(seconds=60)}
    forged = jwt.encode(claims, "x" * 40, algorithm="HS256")

    assert (await client.post("/events/demo_opened", headers={"Authorization": f"Bearer {forged}"})).status_code == 401


async def test_a_day_stops_counting_at_the_most(db_session, monkeypatch):
    await empty(db_session)
    monkeypatch.setattr(admin, "MOST_EVENTS_PER_DAY", 3)

    for _ in range(6):
        await admin.record_event(db_session, "demo_opened", NOW)

    assert (await db_session.execute(select(SiteEvent.count))).scalar_one() == 3


async def test_each_day_has_its_own_count(db_session):
    await empty(db_session)

    await admin.record_event(db_session, "demo_opened", NOW)
    await admin.record_event(db_session, "demo_opened", NOW + timedelta(days=1))

    assert sorted((await db_session.execute(select(SiteEvent.count))).scalars().all()) == [1, 1]


async def test_the_event_table_cannot_hold_who_did_it():
    # A name, a day and a count: a test fails if a column is added that could say who.
    assert sorted(column.name for column in SiteEvent.__table__.columns) == ["count", "day", "name"]


# --- the charts and the comparison ---
@pytest.mark.parametrize("days", [7, 30, 90])
async def test_the_chart_reaches_back_as_far_as_asked_oldest_first(db_session, days):
    await empty(db_session)

    stats = await admin.collect(db_session, NOW, days=days)

    assert stats["range_days"] == days
    assert len(stats["by_day"]) == days
    assert stats["by_day"][-1]["day"] == TODAY.isoformat()
    assert stats["by_day"][0]["day"] == (TODAY - timedelta(days=days - 1)).isoformat()
    assert all(set(row) == {"day", *admin.DAILY_FIELDS} for row in stats["by_day"])


async def test_a_length_that_is_not_offered_is_refused(db_session):
    with pytest.raises(ValueError):
        await admin.collect(db_session, NOW, days=45)


async def test_every_day_holds_what_happened_that_day(db_session):
    await empty(db_session)
    a, b = await person(db_session, created_at=NOW - timedelta(days=2)), await person(db_session, created_at=NOW - timedelta(days=2))
    day = TODAY - timedelta(days=2)
    db_session.add_all([
        document(a, NOW - timedelta(days=2)), document(a, NOW - timedelta(days=2)), document(b, NOW),
        Usage(user_id=a.id, day=day, kind="ask", count=4), Usage(user_id=b.id, day=day, kind="ask", count=1),
        Usage(user_id=a.id, day=day, kind="read", count=2), Usage(user_id=a.id, day=day, kind="analyze", count=3),
        SiteEvent(day=day, name="demo_opened", count=7), SiteEvent(day=day, name="demo_finished", count=2),
    ])
    await db_session.commit()
    await admin.record_signal(db_session, a.id, NOW - timedelta(days=2))
    await admin.record_signal(db_session, a.id, NOW - timedelta(days=2) + timedelta(seconds=45))
    await admin.record_signal(db_session, b.id, NOW - timedelta(days=2))

    rows = {row["day"]: row for row in (await admin.collect(db_session, NOW, days=7))["by_day"]}

    that = rows[day.isoformat()]
    assert (that["signed_up"], that["people"], that["visits"], that["minutes"]) == (2, 2, 2, 0.8)
    assert (that["documents"], that["questions"], that["reads"], that["overviews"]) == (2, 5, 2, 3)
    assert (that["demo_opened"], that["demo_finished"]) == (7, 2)
    assert rows[TODAY.isoformat()]["documents"] == 1
    assert rows[(TODAY - timedelta(days=1)).isoformat()]["documents"] == 0


async def test_a_stretch_is_compared_with_the_one_before_it_of_the_same_length(db_session):
    await empty(db_session)
    a = await person(db_session, created_at=NOW - timedelta(days=60))
    db_session.add_all([
        Usage(user_id=a.id, day=TODAY - timedelta(days=1), kind="ask", count=6),
        Usage(user_id=a.id, day=TODAY - timedelta(days=9), kind="ask", count=4),
        Usage(user_id=a.id, day=TODAY - timedelta(days=30), kind="ask", count=100),
        SiteEvent(day=TODAY - timedelta(days=2), name="demo_opened", count=5),
        SiteEvent(day=TODAY - timedelta(days=10), name="demo_opened", count=2),
    ])
    await db_session.commit()
    await admin.record_signal(db_session, a.id, NOW - timedelta(days=1))
    await admin.record_signal(db_session, a.id, NOW - timedelta(days=9))

    period = (await admin.collect(db_session, NOW, days=7))["period"]

    assert (period["current"]["questions"], period["previous"]["questions"]) == (6, 4)
    assert (period["current"]["demo_opened"], period["previous"]["demo_opened"]) == (5, 2)
    assert (period["current"]["people"], period["previous"]["people"]) == (1, 1)


async def test_people_in_a_stretch_are_counted_once_each_not_once_a_day(db_session):
    await empty(db_session)
    a = await person(db_session)
    for offset in (0, 1, 2):
        await admin.record_signal(db_session, a.id, NOW - timedelta(days=offset))

    period = (await admin.collect(db_session, NOW, days=7))["period"]["current"]

    assert period["people"] == 1


# --- how far people get ---
async def test_the_funnel_counts_people_at_each_step(db_session):
    await empty(db_session)
    everyone = [await person(db_session) for _ in range(5)]
    uploaded, asked, returned, sharer = everyone[1], everyone[2], everyone[3], everyone[4]
    db_session.add_all([document(user, NOW) for user in (uploaded, asked, returned, sharer)])
    db_session.add_all([Usage(user_id=user.id, day=TODAY, kind="ask", count=1) for user in (asked, returned, sharer)])
    db_session.add(DashboardShare(owner_id=sharer.id, token_hash=uuid.uuid4().hex, code_hash="c", status="invited", expires_at=NOW + timedelta(days=1)))
    await db_session.commit()
    await admin.record_signal(db_session, returned.id, NOW)
    await admin.record_signal(db_session, returned.id, NOW - timedelta(days=3))
    await admin.record_signal(db_session, asked.id, NOW)

    funnel = (await admin.collect(db_session, NOW))["funnel"]

    assert funnel == {"signed_up": 5, "uploaded_a_document": 4, "asked_a_question": 3, "came_back_another_day": 1, "shared_their_dashboard": 1}


async def test_the_demo_numbers_count_what_the_website_sent(db_session):
    await empty(db_session)
    db_session.add_all([
        SiteEvent(day=TODAY, name="demo_opened", count=10), SiteEvent(day=TODAY - timedelta(days=20), name="demo_opened", count=5),
        SiteEvent(day=TODAY, name="demo_finished", count=4), SiteEvent(day=TODAY - timedelta(days=40), name="demo_finished", count=1),
    ])
    await db_session.commit()

    demo = (await admin.collect(db_session, NOW))["demo"]

    assert demo == {"opened_total": 15, "finished_total": 5, "opened_7_days": 10, "finished_7_days": 4, "opened_30_days": 15, "finished_30_days": 4}


# --- a report to download ---
async def test_a_day_report_holds_that_day_only(db_session):
    await empty(db_session)
    a = await person(db_session, created_at=NOW - timedelta(days=1), signup_reason="lease")
    db_session.add_all([document(a, NOW - timedelta(days=1)), document(a, NOW), Usage(user_id=a.id, day=TODAY - timedelta(days=1), kind="ask", count=3)])
    await db_session.commit()
    await admin.record_signal(db_session, a.id, NOW - timedelta(days=1))

    report = await admin.report(db_session, "day", TODAY - timedelta(days=1), NOW)

    assert (report["period"], report["label"], report["from"], report["to"]) == ("day", "2026-11-11", "2026-11-11", "2026-11-11")
    assert (report["totals"]["signed_up"], report["totals"]["documents"], report["totals"]["questions"], report["totals"]["people"]) == (1, 1, 3, 1)
    assert report["reasons_of_new_people"] == {"lease": 1}
    assert [row["day"] for row in report["by_day"]] == ["2026-11-11"]


async def test_a_month_report_runs_to_today_while_the_month_is_not_over(db_session):
    await empty(db_session)

    report = await admin.report(db_session, "month", TODAY, NOW)

    assert (report["label"], report["from"], report["to"]) == ("2026-11", "2026-11-01", "2026-11-12")
    assert len(report["by_day"]) == 12


async def test_a_month_that_is_over_is_whole_and_december_rolls_into_january(db_session):
    await empty(db_session)

    october = await admin.report(db_session, "month", datetime(2026, 10, 15).date(), NOW)
    december = await admin.report(db_session, "month", datetime(2025, 12, 20).date(), NOW)

    assert (october["from"], october["to"], len(october["by_day"])) == ("2026-10-01", "2026-10-31", 31)
    assert (december["from"], december["to"], len(december["by_day"])) == ("2025-12-01", "2025-12-31", 31)


async def test_a_day_in_the_future_is_held_to_today(db_session):
    await empty(db_session)

    report = await admin.report(db_session, "day", TODAY + timedelta(days=5), NOW)

    assert report["to"] == TODAY.isoformat() and report["from"] == TODAY.isoformat()


async def test_a_report_for_something_other_than_a_day_or_month_is_refused(db_session):
    with pytest.raises(ValueError):
        await admin.report(db_session, "year", TODAY, NOW)


# --- who may see it ---
async def test_the_report_and_the_range_are_for_the_owner_only(client, db_session, monkeypatch):
    await empty(db_session)
    owner, stranger = await person(db_session), await person(db_session)
    monkeypatch.setattr(settings, "admin_emails", owner.email)

    async def as_owner():
        return owner

    async def as_stranger():
        return stranger

    app.dependency_overrides[get_current_user] = as_owner
    ok = await client.get("/admin/report", params={"period": "month", "date": "2026-11-12"})
    ranged = await client.get("/admin/stats", params={"days": 90})
    refused_range = await client.get("/admin/stats", params={"days": 45})
    app.dependency_overrides[get_current_user] = as_stranger
    nope = await client.get("/admin/report", params={"period": "day", "date": "2026-11-12"})
    nope_stats = await client.get("/admin/stats", params={"days": 7})

    assert ok.status_code == 200 and ok.json()["period"] == "month"
    assert ranged.status_code == 200 and len(ranged.json()["by_day"]) == 90
    assert refused_range.status_code == 400 and refused_range.json() == {"detail": "days must be 7, 30 or 90"}
    assert nope.status_code == 404 and nope_stats.status_code == 404


async def test_nothing_in_the_report_or_the_stats_can_name_a_person_or_a_file(db_session):
    await empty(db_session)
    a = await person(db_session, first_name="Mallory", last_name="Secretname", signup_reason="loan")
    db_session.add_all([document(a, NOW, filename="my-private-lease.pdf"), Usage(user_id=a.id, day=TODAY, kind="ask", count=1)])
    db_session.add(DashboardShare(owner_id=a.id, label="For my landlord Zed", token_hash=uuid.uuid4().hex, code_hash="c", status="active", expires_at=NOW))
    await db_session.commit()
    await admin.record_signal(db_session, a.id, NOW)

    text = json.dumps([await admin.collect(db_session, NOW, days=90), await admin.report(db_session, "month", TODAY, NOW)]).lower()

    for secret in (a.email.lower(), "mallory", "secretname", "my-private-lease", "landlord", "zed", "@example.com"):
        assert secret not in text
