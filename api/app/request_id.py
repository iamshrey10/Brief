import re
import uuid
from contextvars import ContextVar

# What a caller may send as its own request id. Anything else is replaced, because the id ends up in
# every log line and a newline or a space in it could be used to forge a line.
_ACCEPTABLE = re.compile(r"[A-Za-z0-9-]{8,64}")

# The id of the request being handled, so a log line written anywhere during it can say which one.
current: ContextVar[str] = ContextVar("request_id", default="-")


def accept_or_make(sent: str | None) -> str:
    if sent and _ACCEPTABLE.fullmatch(sent):
        return sent
    return uuid.uuid4().hex
