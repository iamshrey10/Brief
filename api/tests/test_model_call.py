import logging
from types import SimpleNamespace

import pytest
from google.genai import errors as genai_errors

from app import model_call
from app.model_call import MAX_GENERATION_RETRIES, MAX_TOTAL_WAIT_SECONDS, generate


def api_error(code: int, message: str) -> genai_errors.APIError:
    status = "RESOURCE_EXHAUSTED" if code == 429 else "INTERNAL"
    return genai_errors.ClientError(code, {"error": {"message": message, "status": status}}, None)


def rate_limited(retry_in: str = "20s") -> genai_errors.APIError:
    return api_error(429, f"You exceeded your current quota. Please retry in {retry_in}.")


class ScriptedClient:
    """A model client that plays back a script: an exception to raise, or a response to return."""

    def __init__(self, script):
        self.script = list(script)
        self.calls: list[dict] = []
        self.models = self

    def generate_content(self, *, model, contents, config):
        self.calls.append({"model": model, "contents": contents, "config": config})
        outcome = self.script.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


@pytest.fixture(autouse=True)
def no_real_waiting(monkeypatch):
    waits: list[float] = []
    monkeypatch.setattr(model_call, "_sleep", waits.append)
    monkeypatch.setattr(model_call, "_jitter", lambda: 0.0)
    return waits


def call(client, kind="answer"):
    return generate(client, kind, model="m", contents="prompt", config="cfg")


def test_a_call_that_works_returns_the_response_with_no_waiting(no_real_waiting):
    response = SimpleNamespace(parsed="the answer")
    client = ScriptedClient([response])

    assert call(client) is response
    assert no_real_waiting == []
    assert client.calls == [{"model": "m", "contents": "prompt", "config": "cfg"}]


def test_a_rate_limit_is_waited_out_as_told_and_the_same_call_is_tried_again(no_real_waiting):
    response = SimpleNamespace(parsed="ok")
    client = ScriptedClient([rate_limited("20s"), response])

    assert call(client) is response
    assert no_real_waiting == [21.0]  # what Gemini said, plus a second
    assert len(client.calls) == 2 and client.calls[0] == client.calls[1]


def test_a_little_random_time_is_added_so_many_waiting_calls_do_not_all_return_at_once(
    no_real_waiting, monkeypatch
):
    monkeypatch.setattr(model_call, "_jitter", lambda: 2.5)
    client = ScriptedClient([rate_limited("20s"), SimpleNamespace(parsed="ok")])

    call(client)

    assert no_real_waiting == [23.5]


def test_the_jitter_is_a_small_random_amount(monkeypatch):
    monkeypatch.undo()  # the real jitter, not the zero the other tests use
    values = {round(model_call._jitter(), 3) for _ in range(30)}

    assert all(0 <= value <= model_call.JITTER_SECONDS for value in values)
    assert len(values) > 1  # it really is random


@pytest.mark.parametrize("code", [400, 401, 403, 404, 500, 503])
def test_an_error_that_is_not_a_rate_limit_is_raised_straight_away(no_real_waiting, code):
    client = ScriptedClient([api_error(code, "something else")])

    with pytest.raises(genai_errors.APIError):
        call(client)

    assert no_real_waiting == [] and len(client.calls) == 1


def test_a_daily_quota_is_not_waited_for_since_waiting_will_not_help(no_real_waiting):
    daily = api_error(429, "Quota exceeded, quotaId: GenerateRequestsPerDayPerProjectPerModel")
    client = ScriptedClient([daily])

    with pytest.raises(genai_errors.APIError):
        call(client)

    assert no_real_waiting == [] and len(client.calls) == 1


def test_it_gives_up_after_the_retry_limit(no_real_waiting):
    client = ScriptedClient([rate_limited("5s") for _ in range(MAX_GENERATION_RETRIES + 1)])

    with pytest.raises(genai_errors.APIError):
        call(client)

    assert len(client.calls) == MAX_GENERATION_RETRIES + 1
    assert len(no_real_waiting) == MAX_GENERATION_RETRIES


def test_it_does_not_wait_longer_in_total_than_a_request_can_afford(no_real_waiting):
    # Two waits of 41 seconds would be 82 seconds, past what a person will sit and wait for.
    client = ScriptedClient([rate_limited("40s"), rate_limited("40s"), SimpleNamespace(parsed="ok")])

    with pytest.raises(genai_errors.APIError):
        call(client)

    assert no_real_waiting == [41.0]  # waited once, and gave up rather than wait a second time
    assert sum(no_real_waiting) <= MAX_TOTAL_WAIT_SECONDS


def test_one_wait_longer_than_the_whole_allowance_is_not_taken_at_all(no_real_waiting):
    client = ScriptedClient([rate_limited("120s")])

    with pytest.raises(genai_errors.APIError):
        call(client)

    assert no_real_waiting == [] and len(client.calls) == 1


def test_the_total_allowance_is_shorter_than_the_longest_the_pages_wait():
    # The overview page gives up after 90 seconds and a question after 60, so a wait has to fit.
    assert 0 < MAX_TOTAL_WAIT_SECONDS <= 50


def test_each_attempt_is_timed_and_a_refused_one_is_logged_as_failed(caplog):
    client = ScriptedClient([rate_limited("5s"), SimpleNamespace(parsed="ok")])

    with caplog.at_level(logging.INFO):
        call(client, kind="checklist")

    timing = [r.getMessage().split(" in ")[0] for r in caplog.records if r.name == "app.telemetry"]
    assert timing == ["model call checklist failed", "model call checklist ok"]


def test_a_wait_is_logged_with_numbers_only(caplog):
    client = ScriptedClient([rate_limited("5s"), SimpleNamespace(parsed="ok")])

    with caplog.at_level(logging.WARNING):
        call(client)

    waiting = [r.getMessage() for r in caplog.records if r.name == "app.model_call"]
    assert len(waiting) == 1 and "waiting" in waiting[0] and "retry 1 of" in waiting[0]
    assert "prompt" not in caplog.text and "quota" not in caplog.text.lower()


def test_an_unknown_kind_is_refused_before_anything_is_sent():
    client = ScriptedClient([SimpleNamespace(parsed="ok")])

    with pytest.raises(ValueError, match="unknown kind"):
        call(client, kind="mystery")

    assert client.calls == []


def test_the_error_that_finally_reaches_the_caller_is_the_models_own(no_real_waiting):
    error = rate_limited("5s")
    client = ScriptedClient([error] * (MAX_GENERATION_RETRIES + 1))

    with pytest.raises(genai_errors.APIError) as caught:
        call(client)

    assert caught.value is error
