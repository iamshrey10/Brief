import asyncio
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Document
from app.storage import copy_file, delete_file, inspect_upload, key_in_folder

logger = logging.getLogger(__name__)


class FilingError(Exception):
    """The file could not be moved. It is still where it was, and nothing was lost."""


async def file_document(session: AsyncSession, document: Document, folder: str) -> None:
    """Puts a document's file in another folder.

    The file is copied first and the copy is checked to be the same size, the record then points at the copy, and only then
    is the first one removed. A failure at any step leaves the file where it was, still reachable, so nothing can be lost
    by moving. A first copy that cannot be removed afterwards is only left behind, never needed."""
    old_key = document.storage_key
    new_key = key_in_folder(old_key, str(document.user_id), folder)
    if new_key != old_key:
        try:
            before = await asyncio.to_thread(inspect_upload, old_key)
            await asyncio.to_thread(copy_file, old_key, new_key)
            after = await asyncio.to_thread(inspect_upload, new_key)
        except Exception as error:
            raise FilingError("could not copy the file") from error
        if after.size != before.size:
            try:
                await asyncio.to_thread(delete_file, new_key)
            except Exception:
                logger.warning("could not remove a bad copy while moving a file")
            raise FilingError("the copy is not the same size")
        document.storage_key = new_key
    document.folder = folder
    await session.commit()
    if new_key != old_key:
        try:
            await asyncio.to_thread(delete_file, old_key)
        except Exception:
            logger.warning("could not remove the old copy of a moved file")


async def refile_existing(session: AsyncSession) -> int:
    """Moves every file kept the old way, straight under its owner, into the folder its record names. Safe to run again:
    a file already in its folder is left alone. Returns how many were moved."""
    result = await session.execute(select(Document).where(Document.status != "pending"))
    moved = 0
    for document in result.scalars().all():
        if document.storage_key.startswith(f"{document.user_id}/{document.folder}/"):
            continue
        try:
            await file_document(session, document, document.folder)
        except FilingError:
            logger.warning("could not move a file into its folder")
            continue
        moved += 1
    return moved


async def _main() -> None:  # pragma: no cover
    from app.db import async_session

    async with async_session() as session:
        print(f"moved {await refile_existing(session)} files into their folders")


if __name__ == "__main__":  # pragma: no cover
    asyncio.run(_main())
