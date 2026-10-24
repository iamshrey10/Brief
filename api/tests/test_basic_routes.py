import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.auth import get_current_user
from app.db import get_session
from app.main import app


@pytest_asyncio.fixture
async def signed_in(test_user):
    async def current_user():
        return test_user

    app.dependency_overrides[get_current_user] = current_user
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def anonymous():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client


async def test_health_says_the_process_is_up(anonymous):
    response = await anonymous.get("/health")

    assert (response.status_code, response.json()) == (200, {"status": "ok"})


async def test_health_db_says_the_database_answers(anonymous):
    response = await anonymous.get("/health/db")

    assert (response.status_code, response.json()) == (200, {"status": "ok"})


async def test_health_db_is_a_server_error_that_shows_nothing_when_the_database_does_not_answer():
    class Broken:
        async def execute(self, _statement):
            raise ConnectionError("password authentication failed for user brief at 10.0.0.5")

    async def broken_session():
        yield Broken()

    app.dependency_overrides[get_session] = broken_session
    try:
        transport = ASGITransport(app=app, raise_app_exceptions=False)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/health/db")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 500
    assert "password" not in response.text and "10.0.0.5" not in response.text


async def test_me_returns_the_id_and_email_of_the_person_signed_in(signed_in, test_user):
    response = await signed_in.get("/me")

    assert response.status_code == 200
    assert response.json() == {"id": str(test_user.id), "email": test_user.email}


@pytest.mark.parametrize("header", [None, "Bearer not-a-token", "Basic abc"])
async def test_me_refuses_a_caller_who_is_not_signed_in(anonymous, header):
    response = await anonymous.get("/me", headers={"Authorization": header} if header else {})

    assert response.status_code == 401
