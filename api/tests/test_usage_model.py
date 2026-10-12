import datetime

import pytest
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError

from app.models import Usage, User

DAY = datetime.date(2026, 10, 11)


async def test_a_days_count_is_kept_per_person_and_kind(db_session, test_user):
    db_session.add(Usage(user_id=test_user.id, day=DAY, kind="ask", count=3))
    await db_session.commit()

    row = await db_session.scalar(select(Usage).where(Usage.user_id == test_user.id))

    assert (row.day, row.kind, row.count) == (DAY, "ask", 3)


async def test_a_count_starts_at_zero_when_none_is_given(db_session, test_user):
    db_session.add(Usage(user_id=test_user.id, day=DAY, kind="ask"))
    await db_session.commit()

    assert await db_session.scalar(select(Usage.count)) == 0


async def test_there_is_one_row_per_person_day_and_kind(db_session, test_user):
    db_session.add(Usage(user_id=test_user.id, day=DAY, kind="ask", count=1))
    await db_session.commit()
    db_session.add(Usage(user_id=test_user.id, day=DAY, kind="ask", count=1))

    with pytest.raises(IntegrityError):
        await db_session.commit()


async def test_a_different_kind_or_day_is_a_separate_row(db_session, test_user):
    db_session.add_all(
        [
            Usage(user_id=test_user.id, day=DAY, kind="ask", count=1),
            Usage(user_id=test_user.id, day=DAY, kind="read", count=1),
            Usage(user_id=test_user.id, day=DAY + datetime.timedelta(days=1), kind="ask", count=1),
        ]
    )
    await db_session.commit()

    assert await db_session.scalar(select(func.count()).select_from(Usage)) == 3


async def test_deleting_a_user_removes_their_counts_and_no_one_elses(db_session, test_user):
    other = User(email="someone-else-usage@example.com")
    db_session.add(other)
    await db_session.commit()
    db_session.add_all(
        [
            Usage(user_id=test_user.id, day=DAY, kind="ask", count=2),
            Usage(user_id=other.id, day=DAY, kind="ask", count=5),
        ]
    )
    await db_session.commit()
    other_id, mine = other.id, test_user.id

    await db_session.execute(delete(User).where(User.id == mine))
    await db_session.commit()

    remaining = (await db_session.execute(select(Usage.user_id))).scalars().all()
    assert remaining == [other_id]
