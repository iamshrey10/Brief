import logging
import random
import time

from google.genai import errors as genai_errors

from app.ingestion import _rate_limit_wait
from app.telemetry import timed

logger = logging.getLogger(__name__)

# How many times a refused call is tried again. Reading a document needs many calls at once and the
# free tier allows 15 a minute, so some are refused and a short wait clears it.
MAX_GENERATION_RETRIES = 2
# The longest one request waits in total. A person is watching, and the pages give up after a minute
# or a minute and a half, so a wait that would not fit is not taken and the error is shown instead.
MAX_TOTAL_WAIT_SECONDS = 50.0
# Calls refused together would otherwise all come back at the very same moment and be refused again.
JITTER_SECONDS = 3.0

_sleep = time.sleep


def _jitter() -> float:
    return random.uniform(0, JITTER_SECONDS)


def generate(client, kind: str, *, model: str, contents, config):
    """Asks the model for something, waiting out a rate limit instead of failing on it.

    When Gemini says "too many requests, retry in 20s", this waits that long, plus a little random time,
    and asks again, up to a limit of tries and of total waiting. Anything else, an error that is not a
    rate limit or a daily quota that waiting will not clear, is raised straight away, and so is the last
    refusal once the limit is reached. Every attempt is timed and logged as `model call <kind> ...`,
    so a refused one shows as failed."""
    waited = 0.0
    for attempt in range(MAX_GENERATION_RETRIES + 1):
        try:
            with timed(kind):
                return client.models.generate_content(model=model, contents=contents, config=config)
        except genai_errors.APIError as error:
            wait = _rate_limit_wait(error)
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
