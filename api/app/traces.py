import logging
import uuid

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
