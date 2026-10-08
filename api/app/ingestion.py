import asyncio
import logging
import re
import threading
import time
import uuid
from collections.abc import Callable
from datetime import datetime, timezone

import pymupdf
from botocore.exceptions import BotoCoreError, ClientError
from google import genai
from google.genai import errors as genai_errors
from google.genai import types
from sqlalchemy import update
from sqlalchemy.orm.attributes import flag_modified

from app.clause_segmentation import segment_page_into_clauses
from app.config import settings
from app.db import async_session
from app.image_processing import OCR_CONFIDENCE_THRESHOLD, ocr_image
from app.models import EMBEDDING_DIM, Clause, Document, Embedding
from app.pdf_text import page_text
from app.storage import download_file

logger = logging.getLogger(__name__)

# Gemini retired text-embedding-004; gemini-embedding-001 defaults to 3072 dims but
# supports requesting a smaller output via MRL truncation, so we ask for EMBEDDING_DIM
# to match the pgvector column. Only the default 3072-dim output comes pre-normalized,
# so smaller outputs need to be normalized by hand.
EMBEDDING_MODEL = "gemini-embedding-001"
EMBEDDING_BATCH_SIZE = 100

# The free Gemini tier allows only about 100 embedded pieces a minute, and a refused request says
# how long to wait. A 40 page contract is nearly 300 pieces, so without waiting and trying again
# any long document fails halfway and is thrown away. Each wait is capped, and the number of
# retries is bounded, so a document that can never succeed still ends up marked failed.
MAX_RATE_LIMIT_RETRIES = 8
DEFAULT_RETRY_WAIT_SECONDS = 30.0
MAX_RETRY_WAIT_SECONDS = 70.0

# A name of its own so tests can skip the waiting.
_sleep = time.sleep

_client: genai.Client | None = None
# Several threads can ask for the client at the same moment, for example when a document is read
# more than once at a time. Without the lock each would build its own, and the extra ones, once
# thrown away, close the connection the others are using.
_client_lock = threading.Lock()


class UnreadableFileError(Exception):
    """The file is not something that can be opened at all: damaged, not really the kind of file it
    says it is, or protected with a password."""


# The longest document that will be read. Every page costs a reading call on a metered service, so
# a limit keeps one huge file from running up the bill. Generous enough for a real lease or loan.
MAX_PAGES = 100


class TooLongError(Exception):
    """The document has more pages than will be read."""


# The reasons a read can fail, as short codes stored on the document. The page turns each into
# plain words, so a reader is told what to do about it instead of just "Couldn't read".
FAILURE_REASONS = (
    "no_text",
    "unreadable_file",
    "too_long",
    "storage",
    "rate_limit",
    "daily_limit",
    "service_error",
    "unknown",
)


def classify_failure(error: BaseException) -> str:
    """Which of the failure reasons an exception from reading a document belongs to."""
    if isinstance(error, UnreadableFileError):
        return "unreadable_file"
    if isinstance(error, TooLongError):
        return "too_long"
    if isinstance(error, (ClientError, BotoCoreError)):
        return "storage"
    if isinstance(error, genai_errors.APIError):
        if error.code == 429:
            return "daily_limit" if "PerDay" in str(error) else "rate_limit"
        return "service_error"
    return "unknown"


def _set_status(document: Document, status: str, failure_reason: str | None = None) -> None:
    """Changes a document's status and remembers when, so a read that stalls can be told apart
    from one that is simply long. The reason is only kept while the status is failed, so a document
    that is read again, or succeeds, never carries an old reason."""
    document.status = status
    document.status_changed_at = datetime.now(timezone.utc)
    document.failure_reason = failure_reason if status == "failed" else None
    # Progress only means something while a read is under way.
    if status != "processing":
        document.progress_done = None
        document.progress_total = None
        # Progress is saved by a different session, so this one still believes it is empty and
        # would see "no change" and skip clearing it. Mark it changed so the clear is written.
        flag_modified(document, "progress_done")
        flag_modified(document, "progress_total")


async def _save_progress(document_id: uuid.UUID, done: int, total: int) -> None:
    """Records how many pieces of a document are embedded, in its own short transaction so a person
    polling the page sees it while the read is still going."""
    async with async_session() as session:
        await session.execute(
            update(Document)
            .where(Document.id == document_id)
            .values(progress_done=done, progress_total=total)
        )
        await session.commit()


def get_genai_client() -> genai.Client:
    global _client
    with _client_lock:
        if _client is None:
            _client = genai.Client(api_key=settings.gemini_api_key)
        return _client


def extract_pages(file_bytes: bytes, content_type: str) -> tuple[list[str], float | None]:
    """Returns (page_texts, ocr_confidence). Confidence is None for born-digital PDFs,
    which don't go through OCR at all."""
    if content_type.startswith("image/"):
        try:
            text, confidence = ocr_image(file_bytes)
        except OSError as error:  # PIL's UnidentifiedImageError is an OSError
            raise UnreadableFileError("the image could not be opened") from error
        return [text], confidence

    try:
        doc = pymupdf.open(stream=file_bytes, filetype="pdf")
    except (pymupdf.EmptyFileError, pymupdf.FileDataError) as error:
        raise UnreadableFileError("the PDF could not be opened") from error
    try:
        if doc.needs_pass:
            raise UnreadableFileError("the PDF is protected with a password")
        if len(doc) > MAX_PAGES:
            raise TooLongError(f"the document has {len(doc)} pages and the limit is {MAX_PAGES}")
        return [page_text(page) for page in doc], None
    finally:
        doc.close()


def _normalize(vector: list[float]) -> list[float]:
    norm = sum(component * component for component in vector) ** 0.5
    if norm == 0:
        return vector
    return [component / norm for component in vector]


def _rate_limit_wait(error: genai_errors.APIError) -> float | None:
    """How long to wait before trying again, or None when waiting will not help: it is not a
    rate limit at all, or it is a daily quota that will not reset for hours."""
    if error.code != 429:
        return None
    message = str(error)
    if "PerDay" in message:
        return None

    hint = re.search(r"retry in ([\d.]+)s", message)
    wait = float(hint.group(1)) + 1.0 if hint else DEFAULT_RETRY_WAIT_SECONDS
    return min(wait, MAX_RETRY_WAIT_SECONDS)


def embed_texts(
    texts: list[str], on_progress: Callable[[int, int], None] | None = None
) -> list[list[float]]:
    """Embeds every text, a batch at a time. When Gemini says to slow down it waits as long as
    it is told and tries that same batch again, so batches already done are never repeated.
    Blocking, and it can wait for minutes, so async code must call it through to_thread. After each
    finished batch it reports (pieces done, pieces in total) so a long read can show how far it is."""
    client = get_genai_client()
    config = types.EmbedContentConfig(output_dimensionality=EMBEDDING_DIM)
    vectors: list[list[float]] = []

    for batch_start in range(0, len(texts), EMBEDDING_BATCH_SIZE):
        batch = texts[batch_start : batch_start + EMBEDDING_BATCH_SIZE]

        for attempt in range(MAX_RATE_LIMIT_RETRIES + 1):
            try:
                response = client.models.embed_content(
                    model=EMBEDDING_MODEL, contents=batch, config=config
                )
                break
            except genai_errors.APIError as error:
                wait = _rate_limit_wait(error)
                if wait is None or attempt == MAX_RATE_LIMIT_RETRIES:
                    raise
                logger.warning(
                    "embedding rate limited, waiting %.0fs (retry %d of %d)",
                    wait,
                    attempt + 1,
                    MAX_RATE_LIMIT_RETRIES,
                )
                _sleep(wait)

        vectors.extend(_normalize(embedding.values) for embedding in response.embeddings)
        if on_progress is not None:
            on_progress(len(vectors), len(texts))

    return vectors


async def ingest_document(document_id: uuid.UUID) -> None:
    async with async_session() as session:
        document = await session.get(Document, document_id)
        if document is None:
            logger.error("ingest_document called for missing document %s", document_id)
            return

        try:
            _set_status(document, "processing")
            await session.commit()

            file_bytes = download_file(document.storage_key)
            pages, ocr_confidence = extract_pages(file_bytes, document.content_type)
            document.ocr_confidence = ocr_confidence

            chunk_records: list[tuple[int, int, int, str]] = []
            for page_number, page_text in enumerate(pages, start=1):
                for char_start, char_end, chunk_text in segment_page_into_clauses(page_text):
                    chunk_records.append((page_number, char_start, char_end, chunk_text))

            if not chunk_records:
                _set_status(document, "failed", "no_text")
                await session.commit()
                logger.error("no extractable text found in document %s", document_id)
                return

            # Off the event loop: a long document can wait minutes for the rate limit, and
            # blocking here would freeze every other request the server is handling.
            texts = [text for *_rest, text in chunk_records]
            loop = asyncio.get_running_loop()
            await _save_progress(document.id, 0, len(texts))

            def report(done: int, total: int) -> None:
                # Called from the worker thread, so hand the save back to the event loop and wait.
                asyncio.run_coroutine_threadsafe(
                    _save_progress(document_id, done, total), loop
                ).result()

            vectors = await asyncio.to_thread(embed_texts, texts, report)

            for index, ((page_number, char_start, char_end, chunk_text), vector) in enumerate(
                zip(chunk_records, vectors, strict=True)
            ):
                clause = Clause(
                    document_id=document.id,
                    clause_index=index,
                    page_number=page_number,
                    char_start=char_start,
                    char_end=char_end,
                    text=chunk_text,
                )
                session.add(clause)
                await session.flush()
                session.add(Embedding(clause_id=clause.id, vector=vector))

            if ocr_confidence is not None and ocr_confidence < OCR_CONFIDENCE_THRESHOLD:
                _set_status(document, "needs_retake")
            else:
                _set_status(document, "ready")
            await session.commit()
        except Exception as error:
            logger.exception("ingestion failed for document %s", document_id)
            await session.rollback()
            document = await session.get(Document, document_id)
            if document is not None:
                _set_status(document, "failed", classify_failure(error))
                await session.commit()
