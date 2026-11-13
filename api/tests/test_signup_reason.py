import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.auth import get_current_user
from app.main import app
from app.models import User


@pytest_asyncio.fixture
async def signed_in(test_user):
    async def current_user():
        return test_user

    app.dependency_overrides[get_current_user] = current_user
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()


async def _reason_of(db_session, user_id):
    db_session.expire_all()
    return (await db_session.execute(select(User.signup_reason).where(User.id == user_id))).scalar_one()


async def test_the_welcome_page_saves_why_the_person_came_along_with_their_name(signed_in, test_user, db_session):
    response = await signed_in.patch("/me", json={"first_name": "Ada", "last_name": "Lovelace", "reason": "lease"})

    assert response.status_code == 200
    assert response.json()["first_name"] == "Ada"
    assert "reason" not in response.json()
    assert await _reason_of(db_session, test_user.id) == "lease"


@pytest.mark.parametrize("reason", ["lease", "loan", "job_offer", "exploring"])
async def test_each_of_the_four_reasons_is_accepted(signed_in, test_user, db_session, reason):
    response = await signed_in.patch("/me", json={"first_name": "Ada", "last_name": "Lovelace", "reason": reason})

    assert response.status_code == 200
    assert await _reason_of(db_session, test_user.id) == reason


async def test_a_reason_is_optional_and_a_person_may_skip_it(signed_in, test_user, db_session):
    response = await signed_in.patch("/me", json={"first_name": "Ada", "last_name": "Lovelace"})

    assert response.status_code == 200
    assert await _reason_of(db_session, test_user.id) is None


async def test_changing_a_name_later_does_not_wipe_the_reason(signed_in, test_user, db_session):
    await signed_in.patch("/me", json={"first_name": "Ada", "last_name": "Lovelace", "reason": "loan"})
    await signed_in.patch("/me", json={"first_name": "Augusta", "last_name": "King"})

    assert await _reason_of(db_session, test_user.id) == "loan"


@pytest.mark.parametrize("reason", ["", "anything else", "LEASE", "<script>", "x" * 40])
async def test_only_the_four_known_reasons_are_accepted(signed_in, test_user, db_session, reason):
    response = await signed_in.patch("/me", json={"first_name": "Ada", "last_name": "Lovelace", "reason": reason})

    assert response.status_code == 422
    assert await _reason_of(db_session, test_user.id) is None
