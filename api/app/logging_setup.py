import json
import logging
from datetime import datetime, timezone

from app import request_id
from app.config import LOG_FORMATS, settings


class _AddRequestId(logging.Filter):
    """Stamps each line with the id of the request being handled, or a dash when there is none."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id.current.get()
        return True


class _JsonFormatter(logging.Formatter):
    """One JSON object per line. An error is named by its type only: its message and trace could hold text."""

    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "time": datetime.fromtimestamp(record.created, timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "request_id": getattr(record, "request_id", "-"),
            "message": record.getMessage(),
        }
        if record.exc_info:
            entry["error_type"] = record.exc_info[0].__name__
        return json.dumps(entry)


def configure_logging(log_format: str | None = None) -> None:
    """Makes the app's own INFO lines visible, which the server does not do by itself: it sets up only
    its own loggers, so everything the app logs below WARNING, including the timing line for each model
    call, was silently dropped.

    Only the `app` logger is turned on. Turning on the root logger would also show what the HTTP and
    Google libraries say at INFO, and those lines can carry web addresses. The lines still reach the
    root, so tests and any other handler see them. Safe to call more than once."""
    chosen = log_format if log_format is not None else settings.log_format
    if chosen not in LOG_FORMATS:
        raise ValueError("the log format must be text or json")
    logger = logging.getLogger("app")
    logger.setLevel(logging.INFO)
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.addFilter(_AddRequestId())
        handler.setFormatter(
            _JsonFormatter()
            if chosen == "json"
            else logging.Formatter("%(levelname)s:     [%(request_id)s] %(name)s: %(message)s")
        )
        logger.addHandler(handler)
