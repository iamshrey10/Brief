import logging
import time
from collections.abc import Iterator
from contextlib import contextmanager

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
