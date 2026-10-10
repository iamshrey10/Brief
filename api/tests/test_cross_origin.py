import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app

ORIGIN = "https://some-other-site.example"


@pytest.fixture
async def anonymous_client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client


@pytest.mark.parametrize("path", ["/health", "/documents", "/me"])
async def test_a_plain_request_from_another_site_gets_no_permission_to_read_the_answer(
    anonymous_client, path
):
    response = await anonymous_client.get(path, headers={"Origin": ORIGIN})

    assert "access-control-allow-origin" not in response.headers
    assert "access-control-allow-credentials" not in response.headers


@pytest.mark.parametrize("method", ["GET", "POST", "PATCH", "DELETE"])
async def test_a_browsers_permission_check_from_another_site_is_not_approved(anonymous_client, method):
    response = await anonymous_client.options(
        "/documents",
        headers={
            "Origin": ORIGIN,
            "Access-Control-Request-Method": method,
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )

    assert "access-control-allow-origin" not in response.headers
    assert "access-control-allow-methods" not in response.headers
    assert "access-control-allow-headers" not in response.headers


def test_the_app_has_no_cross_origin_middleware():
    names = [middleware.cls.__name__ for middleware in app.user_middleware]

    assert "CORSMiddleware" not in names
