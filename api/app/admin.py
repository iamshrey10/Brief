"""What the admin page shows, and how the time people spend in Brief is counted.

Everything here is a count or a total. Nothing in what it returns names a person, an address, a file or a document:
the numbers are the whole answer, and a test checks that no address or name can appear in it."""

import datetime as dt
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Activity, DashboardShare, Document, Usage, User
from app.usage import model_calls_today

# A signal arrives about every 30 seconds while Brief is open and in use. One that comes after this long a gap is the
# start of a new visit, and the gap is not counted as time spent.
VISIT_GAP = timedelta(seconds=120)
# The most one signal can add. A browser that was asleep and woke up cannot add more than this by being late.
MOST_PER_SIGNAL = 60
# How many days the charts reach back.
CHART_DAYS = 30


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


async def _count(session: AsyncSession, statement) -> int:
    return int((await session.execute(statement)).scalar_one() or 0)


async def collect(session: AsyncSession, now: datetime | None = None) -> dict:
    """Every number for the admin page, as of now. Days are UTC days, as the daily limits are."""
    now = now or datetime.now(timezone.utc)
    today = now.date()
    since_7, since_30 = today - timedelta(days=6), today - timedelta(days=29)

    # People.
    total = await _count(session, select(func.count()).select_from(User))
    new_7 = await _count(session, select(func.count()).select_from(User).where(func.date(User.created_at) >= since_7))
    new_30 = await _count(session, select(func.count()).select_from(User).where(func.date(User.created_at) >= since_30))

    async def active_since(day: dt.date) -> int:
        return await _count(session, select(func.count(func.distinct(Activity.user_id))).where(Activity.day >= day))

    signups = dict((await session.execute(
        select(func.date(User.created_at), func.count()).where(func.date(User.created_at) >= since_30).group_by(func.date(User.created_at))
    )).all())
    daily = {
        row.day: row
        for row in (await session.execute(
            select(Activity.day, func.count().label("people"), func.sum(Activity.seconds).label("seconds"), func.sum(Activity.visits).label("visits"))
            .where(Activity.day >= since_30)
            .group_by(Activity.day)
        )).all()
    }

    # Time in Brief.
    week = [daily[day] for day in _days(today, 7) if day in daily]
    week_seconds = sum(int(row.seconds or 0) for row in week)
    week_visits = sum(int(row.visits or 0) for row in week)
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

    return {
        "generated_at": now.isoformat(),
        "people": {
            "total": total,
            "new_7_days": new_7,
            "new_30_days": new_30,
            "active_today": await active_since(today),
            "active_7_days": people_in_week,
            "active_30_days": await active_since(since_30),
        },
        "time_in_brief": {
            "average_minutes_per_person_per_day_7_days": round(week_seconds / 60 / max(1, sum(int(row.people) for row in week)), 1),
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
        "by_day": [
            {
                "day": day.isoformat(),
                "signed_up": int(signups.get(day, 0)),
                "people": int(daily[day].people) if day in daily else 0,
                "minutes": round(int(daily[day].seconds or 0) / 60, 1) if day in daily else 0.0,
            }
            for day in _days(today, CHART_DAYS)
        ],
    }
