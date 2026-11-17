"""Reminders a person writes for themselves: a title, a date, and optionally a time, a note and one of their own documents.

Brief shows these on the dashboard. It does not send an email, a text or a notification, and nothing here pretends to.
Every query in this module is filtered by the person's id, so a reminder is only ever found, changed or removed by the
person who made it, whatever id is asked for.
"""

import datetime as dt
import uuid
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Document, Reminder

# How many reminders one person can keep, done or not, so a list cannot grow without end.
MAX_REMINDERS = 200
MAX_TITLE = 120
MAX_DESCRIPTION = 500
# A date outside this window is almost certainly a typing slip, such as the year 2206 or 26.
EARLIEST_YEAR = 2000
YEARS_AHEAD = 10


class BadReminder(ValueError):
    """The reminder cannot be kept as asked. The message is written to be shown to the person."""


@dataclass
class ReminderRow:
    reminder: Reminder
    # The name of the linked document, or None when there is none, or it is in the Bin.
    document_name: str | None


def clean_title(raw: str | None) -> str:
    title = " ".join((raw or "").split())
    if not title:
        raise BadReminder("Give the reminder a title.")
    if len(title) > MAX_TITLE:
        raise BadReminder(f"Keep the title to {MAX_TITLE} characters or fewer.")
    return title


def clean_description(raw: str | None) -> str | None:
    text = (raw or "").strip()
    if not text:
        return None
    if len(text) > MAX_DESCRIPTION:
        raise BadReminder(f"Keep the description to {MAX_DESCRIPTION} characters or fewer.")
    return text


def clean_time(value: dt.time | None) -> dt.time | None:
    """A reminder time is to the minute: seconds are dropped."""
    return None if value is None else value.replace(second=0, microsecond=0, tzinfo=None)


def check_date(day: dt.date, today: dt.date | None = None) -> dt.date:
    """A real date, and not one so far off that it must be a mistake. A date in the past is allowed: it shows as overdue."""
    today = today or dt.date.today()
    if day.year < EARLIEST_YEAR or day.year > today.year + YEARS_AHEAD:
        raise BadReminder(f"Choose a date between {EARLIEST_YEAR} and {today.year + YEARS_AHEAD}.")
    return day


async def find_document(session: AsyncSession, user_id: uuid.UUID, raw_id: str) -> Document | None:
    """One of this person's documents that is not in the Bin, or nothing when the id is not one."""
    try:
        document_id = uuid.UUID(raw_id)
    except (ValueError, AttributeError, TypeError):
        return None
    result = await session.execute(
        select(Document).where(Document.id == document_id, Document.user_id == user_id, Document.deleted_at.is_(None))
    )
    return result.scalar_one_or_none()


async def owned(session: AsyncSession, user_id: uuid.UUID, raw_id: str) -> Reminder | None:
    """This person's reminder with this id, or nothing: not found, not theirs and not an id all look the same."""
    try:
        reminder_id = uuid.UUID(raw_id)
    except (ValueError, AttributeError, TypeError):
        return None
    result = await session.execute(select(Reminder).where(Reminder.id == reminder_id, Reminder.user_id == user_id))
    return result.scalar_one_or_none()


async def list_reminders(session: AsyncSession, user_id: uuid.UUID) -> list[ReminderRow]:
    """Every reminder this person has, soonest first. The linked document's name comes along, unless it is in the Bin."""
    result = await session.execute(
        select(Reminder, Document.filename)
        .outerjoin(Document, (Document.id == Reminder.document_id) & Document.deleted_at.is_(None))
        .where(Reminder.user_id == user_id)
        .order_by(Reminder.due_date, Reminder.due_time.asc().nulls_last(), Reminder.created_at)
    )
    return [ReminderRow(reminder=reminder, document_name=name) for reminder, name in result.all()]


async def create_reminder(
    session: AsyncSession,
    user_id: uuid.UUID,
    *,
    title: str,
    due_date: dt.date,
    due_time: dt.time | None,
    description: str | None,
    document_id: uuid.UUID | None,
) -> Reminder | None:
    """Keeps a new reminder, or gives back nothing when the person already has the most they can keep."""
    count = (await session.execute(select(func.count()).select_from(Reminder).where(Reminder.user_id == user_id))).scalar_one()
    if count >= MAX_REMINDERS:
        return None
    reminder = Reminder(
        user_id=user_id,
        title=clean_title(title),
        due_date=check_date(due_date),
        due_time=clean_time(due_time),
        description=clean_description(description),
        document_id=document_id,
    )
    session.add(reminder)
    await session.commit()
    await session.refresh(reminder)
    return reminder


def mark_completed(reminder: Reminder, completed: bool, now: dt.datetime | None = None) -> None:
    """Done keeps the moment it was done, and not done clears it. Doing the same again changes nothing."""
    if completed and reminder.completed_at is None:
        reminder.completed_at = now or dt.datetime.now(dt.timezone.utc)
    elif not completed:
        reminder.completed_at = None
