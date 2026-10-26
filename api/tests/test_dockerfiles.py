import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
API = (ROOT / "api" / "Dockerfile").read_text()
WEB = (ROOT / "web" / "Dockerfile").read_text()
BOTH = [("api", API), ("web", WEB)]


def _setting(text: str, flag: str) -> int:
    match = re.search(rf"--{flag}\s+(\d+)", text)
    assert match, f"the start command has no --{flag}"
    return int(match.group(1))


@pytest.mark.parametrize(("name", "text"), BOTH)
def test_the_container_does_not_run_as_root(name, text):
    users = re.findall(r"^USER\s+(\S+)", text, re.MULTILINE)
    assert users and users[-1] not in ("root", "0"), name


@pytest.mark.parametrize(("name", "text"), BOTH)
def test_no_secret_is_baked_into_the_image(name, text):
    for line in re.findall(r"^(?:ENV|ARG)\s+(.+)$", text, re.MULTILINE):
        assert not re.search(r"SECRET|PASSWORD|API_KEY|TOKEN|PRIVATE", line, re.IGNORECASE), f"{name}: {line}"


@pytest.mark.parametrize(("name", "text"), BOTH)
def test_the_container_says_whether_it_is_alive(name, text):
    assert "HEALTHCHECK" in text, name


def test_the_api_keeps_idle_connections_longer_than_a_load_balancer_does():
    # Load balancers commonly close an idle connection after 60 seconds. If the server closes first, the next
    # request on that connection fails with a gateway error, so the server's own limit has to be longer.
    assert _setting(API, "timeout-keep-alive") >= 65


def test_the_api_lets_a_running_request_finish_before_it_stops():
    assert _setting(API, "timeout-graceful-shutdown") >= 15
