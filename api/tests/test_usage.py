import asyncio
import datetime

import pytest
from sqlalchemy import select

from app import usage
from app.db import async_session
from app.models import Usage, User
from app.usage import DAILY_LIMITS, spend

DAY = datetime.date(2026, 10, 11)


@pytest.fixture(autouse=True)
def small_limits(monkeypatch):
    monkeypatch.setattr(usage, "DAILY_LIMITS", {"ask": 3, "read": 2, "analyze": 1})


async def count_of(db_session, user_id, kind, day=DAY):
    return await db_session.scalar(
        select(Usage.count).where(Usage.user_id == user_id, Usage.day == day, Usage.kind == kind)
    )


async def test_a_person_can_do_something_up_to_the_limit_and_no_more(db_session, test_user):
    results = [await spend(db_session, test_user.id, "ask", today=DAY) for _ in range(5)]

    assert results == [True, True, True, False, False]


async def test_a_refused_try_is_not_counted(db_session, test_user):
    for _ in range(6):
        await spend(db_session, test_user.id, "ask", today=DAY)

    assert await count_of(db_session, test_user.id, "ask") == 3


async def test_the_count_is_saved_as_it_goes(db_session, test_user):
    await spend(db_session, test_user.id, "read", today=DAY)

    assert await count_of(db_session, test_user.id, "read") == 1


async def test_each_kind_has_its_own_limit(db_session, test_user):
    for _ in range(3):
        await spend(db_session, test_user.id, "ask", today=DAY)

    assert await spend(db_session, test_user.id, "ask", today=DAY) is False
    assert await spend(db_session, test_user.id, "read", today=DAY) is True
    assert await spend(db_session, test_user.id, "analyze", today=DAY) is True


async def test_each_person_has_their_own_count(db_session, test_user):
    other = User(email="someone-else-spend@example.com")
    db_session.add(other)
    await db_session.commit()
    for _ in range(3):
        await spend(db_session, test_user.id, "ask", today=DAY)

    assert await spend(db_session, test_user.id, "ask", today=DAY) is False
    assert await spend(db_session, other.id, "ask", today=DAY) is True


async def test_a_new_day_starts_again_from_zero(db_session, test_user):
    for _ in range(4):
        await spend(db_session, test_user.id, "ask", today=DAY)

    tomorrow = DAY + datetime.timedelta(days=1)

    assert await spend(db_session, test_user.id, "ask", today=tomorrow) is True
    assert await count_of(db_session, test_user.id, "ask", day=tomorrow) == 1
    assert await count_of(db_session, test_user.id, "ask", day=DAY) == 3  # yesterday is untouched


async def test_the_day_is_taken_from_the_clock_in_utc_when_none_is_given(db_session, test_user):
    await spend(db_session, test_user.id, "ask")

    today = datetime.datetime.now(datetime.timezone.utc).date()
    assert await count_of(db_session, test_user.id, "ask", day=today) == 1


async def test_a_kind_nobody_defined_is_an_error_not_a_free_pass(db_session, test_user):
    with pytest.raises(ValueError, match="unknown kind"):
        await spend(db_session, test_user.id, "mystery", today=DAY)


@pytest.mark.parametrize("limit", [0, -1])
async def test_a_limit_of_zero_or_less_allows_nothing(db_session, test_user, monkeypatch, limit):
    monkeypatch.setattr(usage, "DAILY_LIMITS", {"ask": limit})

    assert await spend(db_session, test_user.id, "ask", today=DAY) is False
    assert await count_of(db_session, test_user.id, "ask") is None


async def test_simultaneous_requests_cannot_get_past_the_limit(db_session, test_user, monkeypatch):
    monkeypatch.setattr(usage, "DAILY_LIMITS", {"ask": 5})
    user_id = test_user.id

    async def one_request() -> bool:
        async with async_session() as session:  # each request has its own session, as in the app
            return await spend(session, user_id, "ask", today=DAY)

    results = await asyncio.gather(*(one_request() for _ in range(20)))

    assert sum(results) == 5
    assert await count_of(db_session, user_id, "ask") == 5


def test_the_built_in_limits_are_sensible():
    assert set(DAILY_LIMITS) == {"ask", "read", "analyze"}
    assert all(10 <= limit <= 1000 for limit in DAILY_LIMITS.values())
