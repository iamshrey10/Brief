import collections
import logging
import random
import threading
import time

from google.genai import errors as genai_errors

from app.config import settings
from app.ingestion import _rate_limit_wait
from app.telemetry import timed

logger = logging.getLogger(__name__)

# How many times a refused call is tried again. Reading a document needs many calls at once and the
# free tier allows 15 a minute, so some are refused and a short wait clears it.
MAX_GENERATION_RETRIES = 3
# The longest one request waits in total. A person is watching, and the pages give up after a minute
# or a minute and a half, so a wait that would not fit is not taken and the error is shown instead.
MAX_TOTAL_WAIT_SECONDS = 50.0
# Calls refused together would otherwise all come back at the very same moment and be refused again.
JITTER_SECONDS = 3.0
# Gemini answers 503 "overloaded" when it is busy, and a moment later the same call usually works.
# There is no time hint with it, so the wait grows a little with each try: 4s, 8s, 12s.
OVERLOADED_WAIT_SECONDS = 4.0

# Reading one document asks the model for a dozen or more things at once (three full passes, then two
# checks on every answer). All at the same moment they pass the per-minute limit, every one is refused
# and the page shows an error, so only a few are in flight together and the rest wait their turn.
MAX_CONCURRENT_MODEL_CALLS = settings.max_concurrent_model_calls
_in_flight = threading.BoundedSemaphore(MAX_CONCURRENT_MODEL_CALLS)
# A question is a single call that a person is watching, and reading a document is about twenty. So a question
# has a small allowance of its own, and does not wait behind the documents being read.
MAX_CONCURRENT_QUESTION_CALLS = 2
_question_in_flight = threading.BoundedSemaphore(MAX_CONCURRENT_QUESTION_CALLS)
# The kinds of call a person is waiting on at once. Everything else is part of reading a document.
QUESTION_KINDS = frozenset({"answer"})

# The free tier of the model allows 15 calls a minute, counting refused ones. Reading one document
# asks for about twenty, so the calls are spaced to stay just under that, and the last few wait for
# the minute to roll over instead of being refused and failing the whole page.
MAX_CALLS_PER_MINUTE = settings.model_calls_per_minute
# How many of those a minute only questions may use, so reading documents cannot use up the whole minute.
CALLS_RESERVED_FOR_QUESTIONS = settings.model_calls_reserved_for_questions
_started: collections.deque[float] = collections.deque()
_pace_lock = threading.Lock()

_sleep = time.sleep
_clock = time.monotonic
_pause = time.sleep


def _wait_for_a_free_minute_slot(question: bool = True) -> None:
    """Blocks until fewer calls than the allowance started in the last 60 seconds, then takes a slot.

    A question may use the whole allowance. Reading a document may use all but CALLS_RESERVED_FOR_QUESTIONS
    of it, so there is always room for someone's question."""
    allowance = MAX_CALLS_PER_MINUTE if question else max(MAX_CALLS_PER_MINUTE - CALLS_RESERVED_FOR_QUESTIONS, 1)
    while True:
        with _pace_lock:
            now = _clock()
            while _started and now - _started[0] >= 60.0:
                _started.popleft()
            if len(_started) < allowance:
                _started.append(now)
                return
            delay = 60.0 - (now - _started[0])
        _pause(max(delay, 0.05))


def _jitter() -> float:
    return random.uniform(0, JITTER_SECONDS)


def _wait_before_retry(error: genai_errors.APIError, attempt: int) -> float | None:
    """How long to wait before asking again, or None when waiting will not help."""
    if error.code == 503:
        return OVERLOADED_WAIT_SECONDS * (attempt + 1)
    return _rate_limit_wait(error)


def generate(client, kind: str, *, model: str, contents, config):
    """Asks the model for something, waiting out a rate limit or a busy moment instead of failing on it.

    When Gemini says "too many requests, retry in 20s", this waits that long, plus a little random time,
    and asks again, up to a limit of tries and of total waiting. A 503 "overloaded" is tried again
    after a short, growing wait. Anything else, an error that is not a
    rate limit or a daily quota that waiting will not clear, is raised straight away, and so is the last
    refusal once the limit is reached. Every attempt is timed and logged as `model call <kind> ...`,
    so a refused one shows as failed."""
    waited = 0.0
    for attempt in range(MAX_GENERATION_RETRIES + 1):
        try:
            question = kind in QUESTION_KINDS
            _wait_for_a_free_minute_slot(question)
            with _question_in_flight if question else _in_flight, timed(kind):
                return client.models.generate_content(model=model, contents=contents, config=config)
        except genai_errors.APIError as error:
            wait = _wait_before_retry(error, attempt)
            if wait is None or attempt == MAX_GENERATION_RETRIES:
                raise
            wait += _jitter()
            if waited + wait > MAX_TOTAL_WAIT_SECONDS:
                raise
            logger.warning(
                "model rate limited, waiting %.0fs (retry %d of %d)",
                wait,
                attempt + 1,
                MAX_GENERATION_RETRIES,
            )
            _sleep(wait)
            waited += wait
    raise AssertionError("unreachable")
