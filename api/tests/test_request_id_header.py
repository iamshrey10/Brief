import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client


@pytest.mark.parametrize("path", ["/health", "/no-such-page", "/me"])
async def test_every_answer_carries_a_request_id_even_a_not_found_or_a_refusal(client, path):
    response = await client.get(path)

    assert len(response.headers["x-request-id"]) == 32


async def test_it_gives_each_request_its_own_id(client):
    first = await client.get("/health")
    second = await client.get("/health")

    assert first.headers["x-request-id"] != second.headers["x-request-id"]


async def test_it_hands_back_the_id_the_website_sent(client):
    sent = "6f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f"

    response = await client.get("/health", headers={"X-Request-ID": sent})

    assert response.headers["x-request-id"] == sent


async def test_it_replaces_an_id_that_could_forge_a_log_line(client):
    response = await client.get("/health", headers={"X-Request-ID": "abcdefgh ERROR: forged"})

    assert response.headers["x-request-id"] != "abcdefgh ERROR: forged"
    assert len(response.headers["x-request-id"]) == 32
