import logging

from app import request_id


class _AddRequestId(logging.Filter):
    """Stamps each line with the id of the request being handled, or a dash when there is none."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id.current.get()
        return True


def configure_logging() -> None:
    """Makes the app's own INFO lines visible, which the server does not do by itself: it sets up only
    its own loggers, so everything the app logs below WARNING, including the timing line for each model
    call, was silently dropped.

    Only the `app` logger is turned on. Turning on the root logger would also show what the HTTP and
    Google libraries say at INFO, and those lines can carry web addresses. The lines still reach the
    root, so tests and any other handler see them. Safe to call more than once."""
    logger = logging.getLogger("app")
    logger.setLevel(logging.INFO)
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.addFilter(_AddRequestId())
        handler.setFormatter(
            logging.Formatter("%(levelname)s:     [%(request_id)s] %(name)s: %(message)s")
        )
        logger.addHandler(handler)
