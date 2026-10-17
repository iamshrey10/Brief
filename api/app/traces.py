import logging
import re
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import request_id
from app.models import AnswerTrace

logger = logging.getLogger(__name__)

# A fixed list, so a report on outcomes is never split by a misspelling.
OUTCOMES = {"answered", "not_found", "withheld", "nothing_to_search", "failed"}

# More than the model is ever shown or cites, so this only guards against a mistake.
MAX_IDS = 20


async def record_trace(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    document_id: uuid.UUID,
    kind: str,
    outcome: str,
    retrieved: list[str],
    cited: list[str],
    elapsed_ms: int,
) -> None:
    """Saves what one answer used, tagged with the id of the request being handled.

    Only ids, counts and times, never text. Saving is best effort: a failure here is logged without any
    detail and swallowed, because losing a trace must never turn a good answer into an error.
    """
    if outcome not in OUTCOMES:
        raise ValueError("unknown outcome")
    try:
        session.add(
            AnswerTrace(
                user_id=user_id,
                document_id=document_id,
                request_id=request_id.current.get(),
                kind=kind,
                outcome=outcome,
                retrieved=retrieved[:MAX_IDS],
                cited=cited[:MAX_IDS],
                elapsed_ms=elapsed_ms,
            )
        )
        await session.commit()
    except Exception:
        await session.rollback()
        logger.warning("could not record an answer trace")


# What a reference code can be. Narrow on purpose: nothing that could act as a wildcard in a search, and
# long enough that a search cannot match the whole table.
_REFERENCE = re.compile(r"[A-Za-z0-9-]{6,64}")

MAX_FOUND = 20


async def find_traces(session: AsyncSession, reference: str) -> list[AnswerTrace]:
    """The traces whose request id starts with `reference`, newest first, for tracing a reported failure."""
    if not _REFERENCE.fullmatch(reference):
        raise ValueError("not a reference code")
    result = await session.execute(
        select(AnswerTrace)
        .where(AnswerTrace.request_id.startswith(reference, autoescape=True))
        .order_by(AnswerTrace.created_at.desc())
        .limit(MAX_FOUND)
    )
    return list(result.scalars().all())
