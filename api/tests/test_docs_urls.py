import os
import subprocess
import sys

import pytest

from app.docs_urls import docs_urls


@pytest.mark.parametrize("environment", ["development", "test"])
def test_the_documentation_pages_are_served_when_building_and_testing(environment):
    assert docs_urls(environment) == {
        "docs_url": "/docs",
        "redoc_url": "/redoc",
        "openapi_url": "/openapi.json",
    }


def test_nothing_that_lists_the_routes_is_served_in_production():
    assert docs_urls("production") == {"docs_url": None, "redoc_url": None, "openapi_url": None}


def _run(environment: str) -> str:
    env = {
        **os.environ,
        "ENVIRONMENT": environment,
        "SERVICE_JWT_SECRET": "a-long-enough-secret-for-production-use-0123456789",
        "DATABASE_URL": "postgresql+asyncpg://brief:not-the-dev-password@localhost:5432/brief",
    }
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            "import app.main as m; print(m.app.docs_url, m.app.redoc_url, m.app.openapi_url)",
        ],
        capture_output=True,
        text=True,
        timeout=60,
        env=env,
    )
    assert result.returncode == 0, result.stderr
    return result.stdout.split("\n")[-2]


def test_a_server_started_in_production_does_not_serve_its_documentation():
    assert _run("production") == "None None None"


def test_a_server_started_in_development_does_serve_it():
    assert _run("development") == "/docs /redoc /openapi.json"
