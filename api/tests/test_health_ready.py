import pytest
from httpx import ASGITransport, AsyncClient

import app.main as main
from app.main import app


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client


def _pretend(monkeypatch, status):
    async def fake(_session):
        return status

    monkeypatch.setattr(main, "check_ready", fake)


async def test_it_answers_200_and_ready_when_everything_is_in_place(client, monkeypatch):
    _pretend(monkeypatch, {"database": "ok", "migrations": "current"})

    response = await client.get("/health/ready")

    assert response.status_code == 200
    assert response.json() == {"ready": True, "database": "ok", "migrations": "current"}


@pytest.mark.parametrize(
    "status",
    [
        {"database": "unreachable", "migrations": "unknown"},
        {"database": "ok", "migrations": "different"},
        {"database": "ok", "migrations": "unknown"},
    ],
)
async def test_it_answers_503_when_anything_is_missing(client, monkeypatch, status):
    _pretend(monkeypatch, status)

    response = await client.get("/health/ready")

    assert response.status_code == 503
    assert response.json() == {"ready": False, **status}


async def test_it_needs_no_sign_in_and_is_never_cached(client, monkeypatch):
    _pretend(monkeypatch, {"database": "ok", "migrations": "current"})

    response = await client.get("/health/ready")

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
