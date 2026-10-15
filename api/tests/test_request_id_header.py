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


async def test_a_log_line_written_deep_inside_a_request_carries_the_id_it_arrived_with(
    client, monkeypatch, capsys
):
    import logging

    import app.main as main
    from app.logging_setup import configure_logging

    app_logger = logging.getLogger("app")
    handlers = list(app_logger.handlers)
    app_logger.handlers.clear()  # the one made at startup writes to the real stderr, not the captured one
    configure_logging()

    async def checking(_session):
        logging.getLogger("app.readiness").info("checking")
        return {"database": "ok", "migrations": "current"}

    monkeypatch.setattr(main, "check_ready", checking)
    sent = "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d"

    try:
        await client.get("/health/ready", headers={"X-Request-ID": sent})
        written = capsys.readouterr().err
    finally:
        app_logger.handlers[:] = handlers

    assert f"[{sent}] app.readiness: checking" in written
