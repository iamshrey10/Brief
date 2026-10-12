import datetime
import uuid

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Usage

# How many times one person can do each kind of model-backed thing in a day (UTC). Every one of these
# costs a call to a metered service, so the limits keep one account from running up the bill. They are
# generous for real use: a person reads a few documents and asks a handful of questions about each.
#   ask     a question about a document
#   read    starting to read a document: a new upload, a retry, or reading it again
#   analyze working out the key terms or the must-ask questions of a document (saved, so once each)
DAILY_LIMITS = {"ask": 100, "read": 30, "analyze": 60}


async def spend(
    session: AsyncSession,
    user_id: uuid.UUID,
    kind: str,
    today: datetime.date | None = None,
) -> bool:
    """Counts one use of `kind` for this person today, and says whether they are within the daily limit.

    It is one statement, "add one unless the count is already at the limit", so requests that arrive at
    the same moment cannot all pass a check and then all add. A try that is refused is not counted.
    The count is saved straight away, because it has to survive whatever the request does next. A kind
    that was never given a limit is an error and not a free pass."""
    if kind not in DAILY_LIMITS:
        raise ValueError(f"unknown kind of use: {kind}")
    limit = DAILY_LIMITS[kind]
    if limit <= 0:
        return False

    day = today or datetime.datetime.now(datetime.timezone.utc).date()
    statement = (
        insert(Usage)
        .values(user_id=user_id, day=day, kind=kind, count=1)
        .on_conflict_do_update(
            index_elements=[Usage.user_id, Usage.day, Usage.kind],
            set_={"count": Usage.count + 1},
            where=Usage.count < limit,
        )
        .returning(Usage.count)
    )
    counted = (await session.execute(statement)).scalar_one_or_none()
    await session.commit()
    return counted is not None
