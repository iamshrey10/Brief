"""What the admin page shows, and how the time people spend in Brief is counted.

Everything here is a count or a total. Nothing in what it returns names a person, an address, a file or a document:
the numbers are the whole answer, and a test checks that no address or name can appear in it."""

import datetime as dt
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Activity, DashboardShare, Document, SiteEvent, Usage, User
from app.usage import model_calls_today

# A signal arrives about every 30 seconds while Brief is open and in use. One that comes after this long a gap is the
# start of a new visit, and the gap is not counted as time spent.
VISIT_GAP = timedelta(seconds=120)
# The most one signal can add. A browser that was asleep and woke up cannot add more than this by being late.
MOST_PER_SIGNAL = 60
# The lengths of time the charts can show, in days.
RANGES = (7, 30, 90)
# The things that can be counted for a visitor who is not signed in. Anything else is turned away.
EVENT_NAMES = ("demo_opened", "demo_finished")
# The most one event is counted in a day, so nobody can run the number up without limit by repeating a request.
MOST_EVENTS_PER_DAY = 20_000


def admin_addresses() -> set[str]:
    """The addresses allowed to open the admin page, lower case, from the ADMIN_EMAILS setting."""
    return {part.strip().lower() for part in settings.admin_emails.split(",") if part.strip()}


def is_admin(user: User) -> bool:
    return user.email.lower() in admin_addresses()


async def record_signal(session: AsyncSession, user_id: uuid.UUID, now: datetime | None = None) -> None:
    """One signal that this person has Brief open and is using it. It adds the time since the last signal, up to a
    limit, and starts a new visit when there was a long gap or none before."""
    now = now or datetime.now(timezone.utc)
    day = now.date()
    row = await session.get(Activity, (user_id, day), with_for_update=True)
    if row is None:
        row = Activity(user_id=user_id, day=day, seconds=0, visits=0)
        session.add(row)
    if row.last_signal_at is None or now - row.last_signal_at > VISIT_GAP:
        row.visits += 1
    else:
        row.seconds += min(int((now - row.last_signal_at).total_seconds()), MOST_PER_SIGNAL)
    row.last_signal_at = now
    await session.commit()


def _days(today: dt.date, count: int) -> list[dt.date]:
    return [today - timedelta(days=offset) for offset in range(count - 1, -1, -1)]


def _between(start: dt.date, end: dt.date) -> list[dt.date]:
    return [start + timedelta(days=offset) for offset in range((end - start).days + 1)]


async def _count(session: AsyncSession, statement) -> int:
    return int((await session.execute(statement)).scalar_one() or 0)


async def record_event(session: AsyncSession, name: str, now: datetime | None = None) -> bool:
    """Counts one thing that happened today, with nobody attached. Returns whether it was counted: a name that is not on the list is
    refused, and a day that already holds the most is left as it is."""
    if name not in EVENT_NAMES:
        return False
    day = (now or datetime.now(timezone.utc)).date()
    await session.execute(
        pg_insert(SiteEvent)
        .values(day=day, name=name, count=1)
        .on_conflict_do_update(index_elements=[SiteEvent.day, SiteEvent.name], set_={"count": SiteEvent.count + 1}, where=SiteEvent.count < MOST_EVENTS_PER_DAY)
    )
    await session.commit()
    return True


# What is counted for each day, and nothing else.
DAILY_FIELDS = ("signed_up", "people", "visits", "minutes", "documents", "questions", "reads", "overviews", "demo_opened", "demo_finished")


async def _daily(session: AsyncSession, start: dt.date, end: dt.date) -> dict[dt.date, dict]:
    """Every day from start to end, each with its counts. A day with nothing in it is all zeros, so a chart has no gaps."""
    rows: dict[dt.date, dict] = {day: {field: 0 for field in DAILY_FIELDS} for day in _between(start, end)}

    for day, count in (await session.execute(
        select(func.date(User.created_at), func.count()).where(func.date(User.created_at).between(start, end)).group_by(func.date(User.created_at))
    )).all():
        rows[day]["signed_up"] = int(count)
    for day, people, seconds, visits in (await session.execute(
        select(Activity.day, func.count(), func.sum(Activity.seconds), func.sum(Activity.visits)).where(Activity.day.between(start, end)).group_by(Activity.day)
    )).all():
        rows[day].update(people=int(people), minutes=round(int(seconds or 0) / 60, 1), visits=int(visits or 0))
    for day, count in (await session.execute(
        select(func.date(Document.created_at), func.count()).where(func.date(Document.created_at).between(start, end)).group_by(func.date(Document.created_at))
    )).all():
        rows[day]["documents"] = int(count)
    kinds = {"ask": "questions", "read": "reads", "analyze": "overviews"}
    for day, kind, count in (await session.execute(
        select(Usage.day, Usage.kind, func.sum(Usage.count)).where(Usage.day.between(start, end), Usage.kind.in_(tuple(kinds))).group_by(Usage.day, Usage.kind)
    )).all():
        rows[day][kinds[kind]] = int(count or 0)
    for day, name, count in (await session.execute(
        select(SiteEvent.day, SiteEvent.name, SiteEvent.count).where(SiteEvent.day.between(start, end))
    )).all():
        if name in EVENT_NAMES:
            rows[day][name] = int(count)
    return rows


async def _people_between(session: AsyncSession, start: dt.date, end: dt.date) -> int:
    """How many different people had Brief open on at least one day from start to end."""
    return await _count(session, select(func.count(func.distinct(Activity.user_id))).where(Activity.day.between(start, end)))


def _totals(rows: dict[dt.date, dict], people: int) -> dict:
    """The sums of a stretch of days. `people` is how many different people were active, which is not the sum of each day's."""
    total = {field: sum(row[field] for row in rows.values()) for field in DAILY_FIELDS}
    total["people"] = people
    total["minutes"] = round(total["minutes"], 1)
    total["average_minutes_per_visit"] = round(total["minutes"] / max(1, total["visits"]), 1)
    return total


async def collect(session: AsyncSession, now: datetime | None = None, days: int = 30) -> dict:
    """Every number for the admin page, as of now, with the charts reaching back `days` days. Days are UTC days, as the daily limits are."""
    if days not in RANGES:
        raise ValueError("days must be one of the ranges")
    now = now or datetime.now(timezone.utc)
    today = now.date()
    since_7, since_30 = today - timedelta(days=6), today - timedelta(days=29)
    start = today - timedelta(days=days - 1)
    previous_end, previous_start = start - timedelta(days=1), start - timedelta(days=days)

    # People.
    total = await _count(session, select(func.count()).select_from(User))
    new_7 = await _count(session, select(func.count()).select_from(User).where(func.date(User.created_at) >= since_7))
    new_30 = await _count(session, select(func.count()).select_from(User).where(func.date(User.created_at) >= since_30))

    async def active_since(day: dt.date) -> int:
        return await _count(session, select(func.count(func.distinct(Activity.user_id))).where(Activity.day >= day))

    # The days on the chart, this stretch and the one before it of the same length, for the comparison.
    current_rows = await _daily(session, start, today)
    previous_rows = await _daily(session, previous_start, previous_end)
    current = _totals(current_rows, await _people_between(session, start, today))
    previous = _totals(previous_rows, await _people_between(session, previous_start, previous_end))

    # Time in Brief, over the last week.
    week_rows = await _daily(session, since_7, today)
    week_seconds = sum(row["minutes"] * 60 for row in week_rows.values())
    week_visits = sum(row["visits"] for row in week_rows.values())
    week_person_days = sum(row["people"] for row in week_rows.values())
    people_in_week = await active_since(since_7)

    # Documents. A deleted one waits in the bin for a week, so the bin is counted out.
    live = Document.deleted_at.is_(None)
    by_kind = dict((await session.execute(select(Document.doc_type, func.count()).where(live).group_by(Document.doc_type))).all())
    by_status = dict((await session.execute(select(Document.status, func.count()).where(live).group_by(Document.status))).all())
    photos = await _count(session, select(func.count()).select_from(Document).where(live, Document.content_type.like("image/%")))
    uploaded_7 = await _count(session, select(func.count()).select_from(Document).where(func.date(Document.created_at) >= since_7))
    uploaded_30 = await _count(session, select(func.count()).select_from(Document).where(func.date(Document.created_at) >= since_30))
    stored = sum(by_kind.values())

    # Questions, reads and overviews, from the counts kept for the daily limits.
    async def used(kind: str, day: dt.date | None = None, since: dt.date | None = None) -> int:
        statement = select(func.sum(Usage.count)).where(Usage.kind == kind)
        if day is not None:
            statement = statement.where(Usage.day == day)
        if since is not None:
            statement = statement.where(Usage.day >= since)
        return int((await session.execute(statement)).scalar_one() or 0)

    # Why people came.
    reasons = dict((await session.execute(select(User.signup_reason, func.count()).group_by(User.signup_reason))).all())

    # Sharing.
    shares = dict((await session.execute(select(DashboardShare.status, func.count()).where(DashboardShare.status.in_(("invited", "requested", "active"))).group_by(DashboardShare.status))).all())

    # How far people get: how many reached each step, counted as people and never named.
    uploaded_people = await _count(session, select(func.count(func.distinct(Document.user_id))))
    asked_people = await _count(session, select(func.count(func.distinct(Usage.user_id))).where(Usage.kind == "ask", Usage.count > 0))
    returned_people = await _count(
        session,
        select(func.count()).select_from(select(Activity.user_id).group_by(Activity.user_id).having(func.count(func.distinct(Activity.day)) >= 2).subquery()),
    )
    sharing_people = await _count(session, select(func.count(func.distinct(DashboardShare.owner_id))))

    # The demo video, from the counts kept with nobody attached.
    async def event_total(name: str, since: dt.date | None = None) -> int:
        statement = select(func.sum(SiteEvent.count)).where(SiteEvent.name == name)
        if since is not None:
            statement = statement.where(SiteEvent.day >= since)
        return int((await session.execute(statement)).scalar_one() or 0)

    opened_total, finished_total = await event_total("demo_opened"), await event_total("demo_finished")

    return {
        "generated_at": now.isoformat(),
        "range_days": days,
        "people": {
            "total": total,
            "new_7_days": new_7,
            "new_30_days": new_30,
            "active_today": await active_since(today),
            "active_7_days": people_in_week,
            "active_30_days": await active_since(since_30),
        },
        "time_in_brief": {
            "average_minutes_per_person_per_day_7_days": round(week_seconds / 60 / max(1, week_person_days), 1),
            "average_minutes_per_visit_7_days": round(week_seconds / 60 / max(1, week_visits), 1),
            "visits_7_days": week_visits,
        },
        "documents": {
            "stored": stored,
            "uploaded_7_days": uploaded_7,
            "uploaded_30_days": uploaded_30,
            "by_kind": {kind: int(count) for kind, count in by_kind.items()},
            "by_status": {status: int(count) for status, count in by_status.items()},
            "photos": photos,
            "pdfs_and_other": stored - photos,
        },
        "questions": {
            "asked_total": await used("ask"),
            "asked_today": await used("ask", day=today),
            "asked_7_days": await used("ask", since=since_7),
        },
        "reads": {"total": await used("read"), "today": await used("read", day=today)},
        "overviews": {"total": await used("analyze"), "today": await used("analyze", day=today)},
        "reasons": {(reason or "not_said"): int(count) for reason, count in reasons.items()},
        "sharing": {"waiting_or_active": sum(int(count) for count in shares.values()), "active": int(shares.get("active", 0))},
        "site": {"model_calls_today": await model_calls_today(session, today), "daily_limit": settings.global_daily_model_calls},
        "funnel": {
            "signed_up": total,
            "uploaded_a_document": uploaded_people,
            "asked_a_question": asked_people,
            "came_back_another_day": returned_people,
            "shared_their_dashboard": sharing_people,
        },
        "demo": {
            "opened_total": opened_total,
            "finished_total": finished_total,
            "opened_7_days": await event_total("demo_opened", since_7),
            "finished_7_days": await event_total("demo_finished", since_7),
            "opened_30_days": await event_total("demo_opened", since_30),
            "finished_30_days": await event_total("demo_finished", since_30),
        },
        "period": {"current": current, "previous": previous},
        "by_day": [{"day": day.isoformat(), **current_rows[day]} for day in _days(today, days)],
    }


async def report(session: AsyncSession, period: str, day: dt.date, now: datetime | None = None) -> dict:
    """The counts for one day, or for the whole of the month that holds `day`, to be downloaded. Like everything else here it is
    counts only. A month that is not over yet runs to today."""
    if period not in ("day", "month"):
        raise ValueError("period must be day or month")
    now = now or datetime.now(timezone.utc)
    if period == "day":
        start = end = day
    else:
        start = day.replace(day=1)
        end = (start.replace(year=start.year + 1, month=1) if start.month == 12 else start.replace(month=start.month + 1)) - timedelta(days=1)
    end = min(end, now.date())
    start = min(start, end)
    rows = await _daily(session, start, end)
    people = await _people_between(session, start, end)
    reasons = dict((await session.execute(
        select(User.signup_reason, func.count()).where(func.date(User.created_at).between(start, end)).group_by(User.signup_reason)
    )).all())
    return {
        "period": period,
        "label": start.isoformat() if period == "day" else start.strftime("%Y-%m"),
        "from": start.isoformat(),
        "to": end.isoformat(),
        "generated_at": now.isoformat(),
        "totals": _totals(rows, people),
        "reasons_of_new_people": {(reason or "not_said"): int(count) for reason, count in reasons.items()},
        "by_day": [{"day": d.isoformat(), **rows[d]} for d in _between(start, end)],
    }
