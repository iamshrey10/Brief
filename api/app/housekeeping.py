import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Document
from app.storage import delete_file

logger = logging.getLogger(__name__)

# An upload is meant to be confirmed within seconds of being started, since its upload link lives five
# minutes. One still waiting after an hour was dropped half way, by a closed tab or a lost connection.
ABANDONED_AFTER = timedelta(hours=1)


async def remove_abandoned_uploads(
    session: AsyncSession, user_id: uuid.UUID, now: datetime | None = None
) -> int:
    """Removes this person's uploads that were started and never confirmed, and returns how many.

    Without this, each one would sit as "Uploading" for ever, keep a file in storage that nothing will
    ever read, and count against the person's document limit. Only a document still pending is ever
    touched, and only one older than the allowed time. As when deleting, the file goes first and then
    the record, and a file that cannot be removed keeps its record, so nothing is orphaned and the next
    call tries it again."""
    cutoff = (now or datetime.now(timezone.utc)) - ABANDONED_AFTER
    result = await session.execute(
        select(Document).where(
            Document.user_id == user_id,
            Document.status == "pending",
            Document.created_at < cutoff,
        )
    )
    removed = 0
    for document in result.scalars().all():
        try:
            await asyncio.to_thread(delete_file, document.storage_key)
        except Exception:
            logger.exception("could not remove the file of an abandoned upload %s", document.id)
            continue
        await session.delete(document)
        await session.commit()
        removed += 1
    return removed
