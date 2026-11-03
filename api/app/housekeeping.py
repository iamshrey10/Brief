import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AnswerTrace, Document
from app.storage import delete_file

logger = logging.getLogger(__name__)

# An upload is meant to be confirmed within seconds of being started, since its upload link lives five
# minutes. One still waiting after an hour was dropped half way, by a closed tab or a lost connection.
ABANDONED_AFTER = timedelta(hours=1)

# How long what an answer used is kept. It is there to trace a failure someone reports, which they do within
# days, and it holds ids only, so a month is plenty.
TRACES_KEPT_FOR = timedelta(days=30)
# How long a document stays in the bin, where it can be restored, before it is removed for good.
TRASH_KEPT_FOR = timedelta(days=7)


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


async def remove_old_traces(
    session: AsyncSession, user_id: uuid.UUID, now: datetime | None = None
) -> int:
    """Removes this person's answer traces older than the kept time, and returns how many.

    Without this the table would only grow. A trace exactly at the limit is kept, and another person's
    traces are never touched."""
    cutoff = (now or datetime.now(timezone.utc)) - TRACES_KEPT_FOR
    result = await session.execute(
        delete(AnswerTrace).where(AnswerTrace.user_id == user_id, AnswerTrace.created_at < cutoff)
    )
    await session.commit()
    return result.rowcount


def trash_days_left(deleted_at: datetime, now: datetime | None = None) -> int:
    """Whole days left to restore a document, counting a part of a day as a day, and never less than zero."""
    expires = deleted_at + TRASH_KEPT_FOR
    remaining = expires - (now or datetime.now(timezone.utc))
    if remaining <= timedelta(0):
        return 0
    return -(-int(remaining.total_seconds()) // 86_400)


async def remove_document_for_good(session: AsyncSession, document: Document) -> bool:
    """Removes a document's file and then the document and everything read from it. Returns False, and keeps the document, when
    the file cannot be removed, so nothing is ever left in storage that no record points to, and the next try finishes it."""
    try:
        await asyncio.to_thread(delete_file, document.storage_key)
    except Exception:
        logger.exception("could not remove the file of document %s", document.id)
        return False
    await session.delete(document)
    await session.commit()
    return True


async def purge_expired_trash(
    session: AsyncSession, now: datetime | None = None, user_id: uuid.UUID | None = None
) -> int:
    """Removes for good the documents that have been in the bin longer than they are kept, and returns how many.

    With a person, only theirs are looked at, which is what runs when they open their bin or start an upload. With none, everyone's
    are, which is what the hourly job does, so a document goes on time even if its owner never comes back."""
    cutoff = (now or datetime.now(timezone.utc)) - TRASH_KEPT_FOR
    query = select(Document).where(Document.deleted_at.is_not(None), Document.deleted_at <= cutoff)
    if user_id is not None:
        query = query.where(Document.user_id == user_id)
    result = await session.execute(query)
    removed = 0
    for document in result.scalars().all():
        if await remove_document_for_good(session, document):
            removed += 1
    return removed
