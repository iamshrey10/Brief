import logging

import pytest

from app import telemetry
from app.telemetry import KINDS, describe_failure, timed


@pytest.fixture
def clock(monkeypatch):
    """A clock that moves only when a test says so."""
    now = [100.0]
    monkeypatch.setattr(telemetry.time, "monotonic", lambda: now[0])
    return now


def telemetry_lines(caplog) -> list[str]:
    return [record.getMessage() for record in caplog.records if record.name == "app.telemetry"]


def test_a_finished_call_logs_its_kind_that_it_worked_and_how_long_it_took(caplog, clock):
    with caplog.at_level(logging.INFO):
        with timed("answer"):
            clock[0] += 2.5

    assert telemetry_lines(caplog) == ["model call answer ok in 2.5s"]


def test_a_call_that_fails_is_logged_as_failed_and_the_error_still_reaches_the_caller(caplog, clock):
    with caplog.at_level(logging.INFO):
        with pytest.raises(RuntimeError, match="the service refused"):
            with timed("key_terms"):
                clock[0] += 0.4
                raise RuntimeError("the service refused")

    assert telemetry_lines(caplog) == ["model call key_terms failed in 0.4s"]


def test_a_value_computed_inside_is_not_swallowed(clock):
    with timed("embed"):
        value = 21 * 2

    assert value == 42


@pytest.mark.parametrize("kind", ["", "ANSWER", "the tenant shall pay $500", "answer; drop table"])
def test_a_kind_nobody_defined_is_refused_before_anything_runs(kind):
    ran = []

    with pytest.raises(ValueError, match="unknown kind"):
        with timed(kind):
            ran.append(True)

    assert ran == []


def test_every_kind_the_app_uses_is_defined():
    assert set(KINDS) == {"embed", "answer", "key_terms", "checklist", "judge"}


def test_the_log_line_carries_nothing_from_the_document_or_the_error(caplog, clock):
    secret = "the tenant pays $2,054.00 to Jane Doe"

    with caplog.at_level(logging.DEBUG):
        with pytest.raises(RuntimeError):
            with timed("answer"):
                raise RuntimeError(secret)

    assert secret not in caplog.text and "Jane" not in caplog.text
    assert "2,054" not in " ".join(str(record.__dict__) for record in caplog.records if record.name == "app.telemetry")


def test_the_time_is_rounded_to_a_tenth_of_a_second(caplog, clock):
    with caplog.at_level(logging.INFO):
        with timed("judge"):
            clock[0] += 1.2345

    assert telemetry_lines(caplog) == ["model call judge ok in 1.2s"]


def test_a_call_that_takes_no_time_is_logged_as_zero(caplog, clock):
    with caplog.at_level(logging.INFO):
        with timed("embed"):
            pass

    assert telemetry_lines(caplog) == ["model call embed ok in 0.0s"]


# --- saying why a call failed without saying what was in it ---


def test_a_service_error_is_described_by_its_type_and_status_code():
    from google.genai import errors as genai_errors

    error = genai_errors.ClientError(
        429, {"error": {"message": "Quota exceeded for the tenant Jane Doe", "status": "RESOURCE_EXHAUSTED"}}, None
    )

    assert describe_failure(error) == "ClientError 429"


def test_a_server_side_error_keeps_its_own_code():
    from google.genai import errors as genai_errors

    error = genai_errors.ServerError(503, {"error": {"message": "overloaded", "status": "UNAVAILABLE"}}, None)

    assert describe_failure(error) == "ServerError 503"


def test_any_other_error_is_described_by_its_type_alone():
    assert describe_failure(RuntimeError("the tenant pays $2,054.00")) == "RuntimeError"
    assert describe_failure(ValueError()) == "ValueError"


def test_the_description_never_contains_the_message():
    from google.genai import errors as genai_errors

    secret = "the tenant Jane Doe pays $2,054.00"
    for error in (
        RuntimeError(secret),
        genai_errors.ClientError(400, {"error": {"message": secret, "status": "INVALID_ARGUMENT"}}, None),
    ):
        assert "Jane" not in describe_failure(error) and "2,054" not in describe_failure(error)
