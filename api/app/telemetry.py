import logging
import time
from collections.abc import Iterator
from contextlib import contextmanager

from google.genai import errors as genai_errors

logger = logging.getLogger(__name__)

# The kinds of model call Brief makes. A fixed list, so what is logged is always one of these words and
# can never be text from a document, a question or an answer.
KINDS = ("embed", "answer", "key_terms", "checklist", "judge")


@contextmanager
def timed(kind: str) -> Iterator[None]:
    """Logs how long one model call took and whether it worked, as a fixed line:
    `model call answer ok in 2.5s`. It records nothing about what was sent or received, not even the
    error message, since those can hold the text of a private document. Errors still reach the caller.

    A call that takes 40 seconds, or fails, is otherwise invisible until someone complains."""
    if kind not in KINDS:
        raise ValueError(f"unknown kind of model call: {kind}")
    started = time.monotonic()
    outcome = "ok"
    try:
        yield
    except BaseException:
        outcome = "failed"
        raise
    finally:
        elapsed = f"{time.monotonic() - started:.1f}"
        logger.info("model call %s %s in %ss", kind, outcome, elapsed)


def describe_failure(error: BaseException) -> str:
    """What kind of failure this was, as a short fixed-shape string such as `ClientError 429`: the type
    of the error and, for the model service's own errors, its status code. Never the message, which can
    repeat text from a private document or a question. It is what lets a 502 be told apart afterwards,
    a rate limit from an overload from a bad request."""
    name = type(error).__name__
    if isinstance(error, genai_errors.APIError):
        return f"{name} {error.code}"
    return name
