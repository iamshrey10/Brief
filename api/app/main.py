import asyncio
import logging
import re
import time
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Request, Response
from google.genai import errors as genai_errors
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import delete, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.config import settings
from app.docs_urls import docs_urls
from app.checklist import ChecklistGenerationError, ChecklistResult, get_checklist, load_checklist
from app.db import get_session
from app.housekeeping import remove_abandoned_uploads, remove_old_traces
from app.ingestion import ingest_document
from app.logging_setup import configure_logging
from app.readiness import check_ready
from app import request_id
from app.key_dates import KeyDate, saved_key_dates
from app.key_terms import KeyTermsGenerationError, KeyTermsResult, get_key_terms, load_key_terms
from app.models import ChecklistAnswerRow, Clause, Document, Extraction, User
from app.qa import AnswerGenerationError, AnswerResult, answer_with_path
from app.retrieval import hybrid_search, reranked_search
from app import usage
from app.telemetry import describe_failure
from app.traces import record_trace
from app.storage import (
    ALLOWED_CONTENT_TYPES,
    MAX_FILE_SIZE_BYTES,
    build_storage_key,
    create_presigned_upload_url,
    UploadMissingError,
    delete_file,
    file_matches_type,
    inspect_upload,
)

configure_logging()
logger = logging.getLogger(__name__)

SEARCHABLE_STATUSES = {"ready", "needs_retake"}


def _elapsed_ms(started: float) -> int:
    return int((time.monotonic() - started) * 1000)

# How many documents one person can keep at a time. Every document costs storage and a read on
# a metered service, so this keeps one account from running up the bill. Deleting frees a slot.
MAX_DOCUMENTS_PER_USER = 25

# A document still being read this long after it was uploaded is stuck. Reading a long one can
# legitimately take several minutes while it waits out the embedding rate limit, so this leaves
# plenty of room before anyone can start a second read.
STUCK_AFTER = timedelta(minutes=15)

app = FastAPI(
    title="Brief API",
    description=(
        "The API behind Brief, which explains a contract and shows the exact words behind every answer. "
        "Every route except the health checks needs a signed-in person's short-lived token, and every "
        "document belongs to exactly one person. Answers carry checked quotes, and when the document does "
        "not say, the answer says so."
    ),
    openapi_tags=[
        {"name": "health", "description": "Is the server up, and can it do real work."},
        {"name": "account", "description": "The signed-in person: who they are, their daily limits, deleting the account."},
        {"name": "documents", "description": "Uploading, reading, renaming and deleting documents."},
        {"name": "answers", "description": "Questions, search, key terms and the questions to ask before signing."},
    ],
    **docs_urls(settings.environment),
)


# What each error answer means, for the API documentation. A test checks that every route documents the
# errors its code can really give, and no others.
_ERROR_MEANINGS = {
    400: "The request is not valid: the message says what is wrong.",
    401: "Not signed in, or the token has expired.",
    404: "There is no such document, or it belongs to someone else.",
    409: "Not allowed in the document's current state, or a limit on how much a person can keep was reached.",
    429: "A daily limit was reached: the message says which one.",
    502: "A service the server relies on had a problem: try again in a moment.",
}


def _errors(*codes: int) -> dict[int | str, dict[str, str]]:
    return {code: {"description": _ERROR_MEANINGS[code]} for code in codes}


@app.middleware("http")
async def tag_with_request_id(request: Request, call_next):
    """Gives every request an id, handed back in X-Request-ID, so one request can be followed through the logs."""
    this_one = request_id.accept_or_make(request.headers.get("x-request-id"))
    token = request_id.current.set(this_one)
    try:
        response = await call_next(request)
    finally:
        request_id.current.reset(token)
    response.headers["X-Request-ID"] = this_one
    return response


DOC_TYPES = {"loan", "lease", "offer", "other"}


@app.get(
    "/health",
    tags=["health"],
    summary="Check that the server is running",
    description=(
        "Says only that the process is up and answering. Use it to decide whether to restart the container, not whether to send it traffic."
    ),
)
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get(
    "/health/db",
    tags=["health"],
    summary="Check the database connection",
    description=(
        "Runs a trivial query to show the database accepts connections. It does not check that the tables are up to date, which /health/ready does."
    ),
)
async def health_db(session: AsyncSession = Depends(get_session)) -> dict[str, str]:
    await session.execute(text("SELECT 1"))
    return {"status": "ok"}


@app.get(
    "/health/ready",
    tags=["health"],
    summary="Check that the server can do real work",
    description=(
        "Answers 200 only when the database responds and is on the migration this code expects, and 503 otherwise. Use it to decide whether to send traffic. The answer never includes an error message."
    ),
)
async def health_ready(
    response: Response, session: AsyncSession = Depends(get_session)
) -> dict[str, str | bool]:
    """For a load balancer: 200 only when this server can do real work, 503 otherwise.

    /health only says the process is up. This also needs the database and its migrations.
    """
    status = await check_ready(session)
    ready = status == {"database": "ok", "migrations": "current"}
    response.status_code = 200 if ready else 503
    response.headers["Cache-Control"] = "no-store"
    return {"ready": ready, **status}


@app.get(
    "/me",
    tags=["account"],
    summary="Show who is signed in",
    description=(
        "Returns the id and email of the signed-in person."
    ),
    responses=_errors(401),
)
async def me(user: User = Depends(get_current_user)) -> dict[str, str]:
    return {"id": str(user.id), "email": user.email}


@app.get(
    "/me/usage",
    tags=["account"],
    summary="Show how much of today's limits are used",
    description=(
        "Returns, for questions, document reads and overviews, how many were used today (UTC), the limit, and how many are left."
    ),
    responses=_errors(401),
)
async def my_usage(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, int]]:
    """Where the signed-in person stands today against each daily limit: used, the limit, and what is
    left. Only reads, so looking never uses anything up."""
    return await usage.usage_today(session, user.id)


@app.get(
    "/me/key-dates",
    tags=["account"],
    summary="Show the dates found in your documents",
    description=(
        "Returns the start and end dates already found in the signed-in person's documents, as the documents word them. Only terms that were already read and saved are included, so this never calls the model and never counts against a daily limit."
    ),
    responses=_errors(401),
)
async def my_key_dates(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[KeyDate]:
    """The dates in this person's documents that are already saved. Looking uses nothing up."""
    return await saved_key_dates(session, user.id)


@app.delete(
    "/me",
    status_code=204,
    tags=["account"],
    summary="Delete the account and everything in it",
    description=(
        "Permanently removes the signed-in person's documents, their stored files and everything read from them, then the account itself. Files go first and the account last, so a failure part way leaves something that can be tried again."
    ),
    responses=_errors(401, 502),
)
async def delete_my_account(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    """Deletes the signed-in person's account and everything in it: every document, its file, and
    everything read from it.

    Documents go one at a time, file first and then its records, exactly as when deleting a single
    document, so a failure part way never leaves a record pointing at a file that is gone or a file
    with no record. If storage fails, what is left stays, the account is not removed, and the request
    can simply be repeated. The account itself goes last."""
    user_id = user.id  # read now: committing below expires the object
    result = await session.execute(select(Document).where(Document.user_id == user_id))
    for document in result.scalars().all():
        try:
            await asyncio.to_thread(delete_file, document.storage_key)
        except Exception as exc:
            logger.exception("could not remove a file while deleting account %s", user_id)
            raise HTTPException(
                status_code=502,
                detail="could not remove all of your files, nothing more was deleted, try again",
            ) from exc
        await session.delete(document)
        await session.commit()

    await session.execute(delete(User).where(User.id == user_id))
    await session.commit()
    return Response(status_code=204)


MAX_FILENAME_LENGTH = 200


def clean_filename(value: str) -> str:
    """The name of a document with its edges trimmed, or a ValueError saying what is wrong with it.
    Used for both a new upload and a rename, so a name that cannot be renamed to cannot be uploaded."""
    name = value.strip()
    if not name:
        raise ValueError("a name cannot be empty")
    if len(name) > MAX_FILENAME_LENGTH:
        raise ValueError(f"a name can be at most {MAX_FILENAME_LENGTH} characters")
    if re.search(r"[\x00-\x1f\x7f]", name):
        raise ValueError("a name cannot contain control characters")
    return name


# What each limited kind of action is called in the message a person sees when they reach its limit.
LIMIT_NOUNS = {"ask": "questions", "read": "document reads", "analyze": "document overviews"}


async def _spend_or_refuse(session: AsyncSession, user: User, kind: str) -> None:
    """Counts one model-backed action against the person's daily limit, or refuses with a plain
    message. Called only once the request is known to be valid and theirs, so a mistaken or
    forbidden request never uses up the limit."""
    if not await usage.spend(session, user.id, kind):
        raise HTTPException(
            status_code=429,
            detail=(
                f"You have reached today's limit of {usage.DAILY_LIMITS[kind]} {LIMIT_NOUNS[kind]}. "
                "Try again tomorrow."
            ),
            headers={"Retry-After": str(usage.seconds_until_reset())},
        )


class CreateUploadRequest(BaseModel):
    filename: str
    doc_type: str
    content_type: str
    file_size_bytes: int


class CreateUploadResponse(BaseModel):
    document_id: str
    upload_url: str


@app.post(
    "/documents",
    tags=["documents"],
    summary="Start an upload",
    description=(
        "Checks the name, kind and size, clears this person's abandoned uploads, enforces the document limit and the daily limit, and returns a short-lived address to send the file to. Nothing is read until the upload is confirmed."
    ),
    responses=_errors(400, 401, 409, 429),
)
async def create_upload(
    body: CreateUploadRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> CreateUploadResponse:
    try:
        filename = clean_filename(body.filename)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from None
    if body.doc_type not in DOC_TYPES:
        raise HTTPException(status_code=400, detail="unknown document type")
    if body.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="unsupported file type")
    if body.file_size_bytes <= 0 or body.file_size_bytes > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="file is too large, 50MB max")

    # Uploads this person started and never confirmed would otherwise hold a slot for ever. Cleared only
    # now that the request is known to be valid, so a refused request changes nothing.
    await remove_abandoned_uploads(session, user.id)
    await remove_old_traces(session, user.id)
    kept = await session.scalar(
        select(func.count()).select_from(Document).where(Document.user_id == user.id)
    )
    if kept >= MAX_DOCUMENTS_PER_USER:
        raise HTTPException(
            status_code=409,
            detail=(
                f"You can keep up to {MAX_DOCUMENTS_PER_USER} documents. "
                "Delete one you no longer need to upload another."
            ),
        )

    # Only now, once the upload is known to be valid and allowed, does it count against the daily limit,
    # and before any record or upload link exists, so a refusal leaves nothing behind.
    await _spend_or_refuse(session, user, "read")

    storage_key = build_storage_key(str(user.id), filename)

    document = Document(
        user_id=user.id,
        filename=filename,
        doc_type=body.doc_type,
        status="pending",
        storage_key=storage_key,
        file_size_bytes=body.file_size_bytes,
        content_type=body.content_type,
    )
    session.add(document)
    await session.commit()
    await session.refresh(document)

    upload_url = create_presigned_upload_url(storage_key, body.content_type)

    return CreateUploadResponse(document_id=str(document.id), upload_url=upload_url)


class DocumentSummary(BaseModel):
    id: str
    filename: str
    doc_type: str
    status: str
    ocr_confidence: float | None = None
    # When it was uploaded, so two copies of the same file can be told apart.
    created_at: datetime | None = None
    # When its status last changed, which is what decides whether a read has stalled.
    status_changed_at: datetime | None = None
    # Why a read failed, a short code the page turns into plain words. Only set while failed.
    failure_reason: str | None = None
    # How far a read has got while processing: pieces done out of the total, otherwise empty.
    progress_done: int | None = None
    progress_total: int | None = None

    @classmethod
    def from_document(cls, document: Document) -> "DocumentSummary":
        return cls(
            id=str(document.id),
            filename=document.filename,
            doc_type=document.doc_type,
            status=document.status,
            ocr_confidence=document.ocr_confidence,
            created_at=document.created_at,
            status_changed_at=document.status_changed_at,
            failure_reason=document.failure_reason,
            progress_done=document.progress_done,
            progress_total=document.progress_total,
        )


async def _get_owned_document(
    document_id: str, user: User, session: AsyncSession
) -> Document:
    try:
        doc_uuid = uuid.UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="document not found") from None

    result = await session.execute(select(Document).where(Document.id == doc_uuid))
    document = result.scalar_one_or_none()

    if document is None or document.user_id != user.id:
        raise HTTPException(status_code=404, detail="document not found")

    return document


@app.patch(
    "/documents/{document_id}/confirm",
    tags=["documents"],
    summary="Confirm that the file has arrived",
    description=(
        "Reads the real size and first bytes from storage and refuses a file that is missing, empty, too large or not the kind it claims, then starts reading it. A repeat confirm is refused."
    ),
    responses=_errors(400, 401, 404, 409, 502),
)
async def confirm_upload(
    document_id: str,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> DocumentSummary:
    """Starts reading an uploaded document, after checking the file that actually arrived. The size
    and type the browser claimed were only claims, so the real size and the first bytes are read from
    storage. A file that is empty, too large, or not what it says it is, is removed and refused."""
    document = await _get_owned_document(document_id, user, session)
    if document.status != "pending":
        raise HTTPException(status_code=409, detail="this upload was already confirmed")

    try:
        info = await asyncio.to_thread(inspect_upload, document.storage_key)
    except UploadMissingError:
        raise HTTPException(status_code=400, detail="the file was not uploaded") from None
    except Exception as exc:
        logger.exception("could not check the uploaded file for document %s", document.id)
        raise HTTPException(status_code=502, detail="could not check the uploaded file") from exc

    problem = None
    if info.size <= 0 or info.size > MAX_FILE_SIZE_BYTES:
        problem = "file is empty or too large, 50MB max"
    elif not file_matches_type(document.content_type or "", info.head):
        problem = "this file does not look like the kind of file it was said to be"
    if problem:
        # The file goes first, as when deleting: if storage fails the document is kept so it can be
        # tried again, and nothing is left behind where nobody can see it.
        try:
            await asyncio.to_thread(delete_file, document.storage_key)
        except Exception as exc:
            logger.exception("could not remove a refused file for document %s", document.id)
            raise HTTPException(status_code=502, detail="could not remove the refused file") from exc
        await session.delete(document)
        await session.commit()
        raise HTTPException(status_code=400, detail=problem)

    document.file_size_bytes = info.size
    document.status = "uploaded"
    document.status_changed_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(document)

    background_tasks.add_task(ingest_document, document.id)

    return DocumentSummary.from_document(document)


@app.post(
    "/documents/{document_id}/retry",
    tags=["documents"],
    summary="Try reading a failed document again",
    description=(
        "Starts another read of a document whose read failed or was stuck. Counts against the daily limit on document reads."
    ),
    responses=_errors(401, 404, 409, 429),
)
async def retry_document(
    document_id: str,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> DocumentSummary:
    """Reads a document again. Allowed only for one that failed, or one that has been stuck
    being read for a long time, so a read that is genuinely under way is never started twice."""
    document = await _get_owned_document(document_id, user, session)

    # Measured from when the status last changed, not from the upload: a document that was just
    # retried has a fresh status change and is not stuck, however long ago it was uploaded.
    since = document.status_changed_at or document.created_at
    stuck = (
        document.status in {"pending", "uploaded", "processing"}
        and datetime.now(timezone.utc) - since > STUCK_AFTER
    )
    if document.status != "failed" and not stuck:
        raise HTTPException(status_code=409, detail="this document does not need another try")
    await _spend_or_refuse(session, user, "read")

    # A failed read saves nothing, but clear any leftovers so a retry always starts clean.
    leftovers = await session.execute(select(Clause).where(Clause.document_id == document.id))
    for clause in leftovers.scalars().all():
        await session.delete(clause)

    document.status = "uploaded"
    document.status_changed_at = datetime.now(timezone.utc)
    document.failure_reason = None
    document.progress_done = None
    document.progress_total = None
    await session.commit()
    await session.refresh(document)

    background_tasks.add_task(ingest_document, document.id)
    return DocumentSummary.from_document(document)


@app.post(
    "/documents/{document_id}/reread",
    tags=["documents"],
    summary="Read an already read document again",
    description=(
        "Clears what was read from the document, its key terms and its checklist answers, and reads the file again. Counts against the daily limit on document reads."
    ),
    responses=_errors(401, 404, 409, 429),
)
async def reread_document(
    document_id: str,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> DocumentSummary:
    """Reads a document that was already read, again from its file, so it gets the benefit of any
    improvement to how documents are read. The old pieces, key terms and checklist answers are
    cleared first and worked out again from the new read. Only for a document that was read: one
    that failed has retry, and one being read is left alone."""
    document = await _get_owned_document(document_id, user, session)
    if document.status not in SEARCHABLE_STATUSES:
        raise HTTPException(status_code=409, detail="this document has not been read yet")
    await _spend_or_refuse(session, user, "read")

    await session.execute(delete(Extraction).where(Extraction.document_id == document.id))
    await session.execute(delete(ChecklistAnswerRow).where(ChecklistAnswerRow.document_id == document.id))
    leftovers = await session.execute(select(Clause).where(Clause.document_id == document.id))
    for clause in leftovers.scalars().all():
        await session.delete(clause)

    document.status = "uploaded"
    document.status_changed_at = datetime.now(timezone.utc)
    document.failure_reason = None
    document.progress_done = None
    document.progress_total = None
    await session.commit()
    await session.refresh(document)

    background_tasks.add_task(ingest_document, document.id)
    return DocumentSummary.from_document(document)


class UpdateDocumentRequest(BaseModel):
    filename: str | None = None
    doc_type: str | None = None

    @field_validator("filename")
    @classmethod
    def _valid_filename(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return clean_filename(value)

    @field_validator("doc_type")
    @classmethod
    def _valid_doc_type(cls, value: str | None) -> str | None:
        if value is not None and value not in DOC_TYPES:
            raise ValueError("unknown kind of document")
        return value

    @model_validator(mode="after")
    def _something_to_change(self) -> "UpdateDocumentRequest":
        if self.filename is None and self.doc_type is None:
            raise ValueError("nothing to change")
        return self


@app.patch(
    "/documents/{document_id}",
    tags=["documents"],
    summary="Rename a document or change its kind",
    description=(
        "Changes the file name and, or, the kind. Changing the kind clears the saved key terms and checklist, because their fields depend on the kind."
    ),
    responses=_errors(401, 404),
)
async def update_document(
    document_id: str,
    body: UpdateDocumentRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> DocumentSummary:
    """Renames a document and/or changes what kind of document it is. Only the display name and
    the kind change: the file, its status, and what was read from it are left alone, except that
    key terms and checklist answers depend on the kind, so changing it clears the saved ones and
    they are worked out again, for the new kind, next time they are asked for."""
    document = await _get_owned_document(document_id, user, session)

    if body.filename is not None:
        document.filename = body.filename

    if body.doc_type is not None and body.doc_type != document.doc_type:
        document.doc_type = body.doc_type
        await session.execute(delete(Extraction).where(Extraction.document_id == document.id))
        await session.execute(
            delete(ChecklistAnswerRow).where(ChecklistAnswerRow.document_id == document.id)
        )

    await session.commit()
    await session.refresh(document)
    return DocumentSummary.from_document(document)


@app.delete(
    "/documents/{document_id}",
    status_code=204,
    tags=["documents"],
    summary="Delete a document",
    description=(
        "Removes the stored file first and then the document and everything read from it. Deleting something already gone is not an error."
    ),
    responses=_errors(401, 404, 502),
)
async def delete_document(
    document_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    """Deletes a document: its file, and everything read from it (pieces, embeddings, key terms,
    and checklist answers).

    The file goes first. If storage fails, the document is kept, so the delete can simply be tried
    again and nothing is left behind where nobody can see it. Deleting a file that is already gone
    succeeds, so a retry after a half finished delete is safe."""
    document = await _get_owned_document(document_id, user, session)

    try:
        await asyncio.to_thread(delete_file, document.storage_key)
    except Exception as exc:
        logger.exception("could not remove the file for document %s", document.id)
        raise HTTPException(
            status_code=502, detail="could not remove the file, nothing was deleted"
        ) from exc

    await session.delete(document)
    await session.commit()
    return Response(status_code=204)


@app.get(
    "/documents",
    tags=["documents"],
    summary="List your documents",
    description=(
        "Returns the signed-in person's documents, newest first, with their status and read progress."
    ),
    responses=_errors(401),
)
async def list_documents(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[DocumentSummary]:
    result = await session.execute(
        select(Document).where(Document.user_id == user.id).order_by(Document.created_at.desc())
    )
    documents = result.scalars().all()

    return [DocumentSummary.from_document(d) for d in documents]


class SearchRequest(BaseModel):
    query: str
    limit: int = Field(default=10, ge=1, le=50)
    # Off by default: on the retrieval eval the MS MARCO cross-encoder lowered top-1
    # accuracy from 96% to 67%, see evals/results. Kept as an opt-in for long documents,
    # where a wider shortlist may change that, which the small fixture can't show.
    rerank: bool = False


class SearchResult(BaseModel):
    clause_id: str
    text: str
    page_number: int
    clause_index: int


@app.post(
    "/documents/{document_id}/search",
    tags=["answers"],
    summary="Search a document",
    description=(
        "Finds the clauses that best match a query, mixing keyword and meaning-based search. Returns clauses, not an answer."
    ),
    responses=_errors(400, 401, 404, 409),
)
async def search_document(
    document_id: str,
    body: SearchRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[SearchResult]:
    document = await _get_owned_document(document_id, user, session)

    if document.status not in SEARCHABLE_STATUSES:
        raise HTTPException(status_code=409, detail="document is not ready to search yet")
    if not body.query.strip():
        raise HTTPException(status_code=400, detail="query cannot be empty")

    search = reranked_search if body.rerank else hybrid_search
    clauses = await search(session, document.id, body.query, limit=body.limit)

    return [
        SearchResult(
            clause_id=str(clause.id),
            text=clause.text,
            page_number=clause.page_number,
            clause_index=clause.clause_index,
        )
        for clause in clauses
    ]


class AskRequest(BaseModel):
    # Capped because the question goes straight into an LLM prompt, bounding both cost and
    # how much room a hostile question has to work with.
    question: str = Field(max_length=1000)


@app.post(
    "/documents/{document_id}/ask",
    tags=["answers"],
    summary="Ask a question about a document",
    description=(
        "Answers from the document's own words, with citations whose quotes are checked word for word. If the document does not say, the answer says so. Counts against the daily limit on questions, and each call saves an answer trace."
    ),
    responses=_errors(400, 401, 404, 409, 429, 502),
)
async def ask_document(
    document_id: str,
    body: AskRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> AnswerResult:
    document = await _get_owned_document(document_id, user, session)

    if document.status not in SEARCHABLE_STATUSES:
        raise HTTPException(status_code=409, detail="document is not ready to ask about yet")
    if not body.question.strip():
        raise HTTPException(status_code=400, detail="question cannot be empty")

    await _spend_or_refuse(session, user, "ask")
    started = time.monotonic()
    try:
        result, path = await answer_with_path(session, document.id, body.question)
    except (AnswerGenerationError, genai_errors.APIError) as exc:
        logger.warning("model call failed: %s", describe_failure(exc))
        await record_trace(
            session,
            user_id=user.id,
            document_id=document.id,
            kind="ask",
            outcome="failed",
            retrieved=[],
            cited=[],
            elapsed_ms=_elapsed_ms(started),
        )
        raise HTTPException(
            status_code=502, detail="the answering service is unavailable, try again"
        ) from exc
    await record_trace(
        session,
        user_id=user.id,
        document_id=document.id,
        kind="ask",
        outcome=path.outcome,
        retrieved=path.retrieved,
        cited=path.cited,
        elapsed_ms=_elapsed_ms(started),
    )
    return result


class ClauseOut(BaseModel):
    id: str
    clause_index: int
    page_number: int
    text: str


@app.get(
    "/documents/{document_id}",
    tags=["documents"],
    summary="Show one document",
    description=(
        "Returns one document of the signed-in person, with its status, kind and read progress."
    ),
    responses=_errors(401, 404),
)
async def get_document(
    document_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> DocumentSummary:
    document = await _get_owned_document(document_id, user, session)

    return DocumentSummary.from_document(document)


@app.get(
    "/documents/{document_id}/clauses",
    tags=["documents"],
    summary="List the clauses of a document",
    description=(
        "Returns the clauses a document was split into, in order, with their page numbers and text."
    ),
    responses=_errors(401, 404),
)
async def list_clauses(
    document_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[ClauseOut]:
    document = await _get_owned_document(document_id, user, session)

    result = await session.execute(
        select(Clause).where(Clause.document_id == document.id).order_by(Clause.clause_index)
    )

    return [
        ClauseOut(
            id=str(clause.id),
            clause_index=clause.clause_index,
            page_number=clause.page_number,
            text=clause.text,
        )
        for clause in result.scalars().all()
    ]


async def _get_readable_document(
    document_id: str, user: User, session: AsyncSession
) -> Document:
    """The user's own document, if it is ready and has text to read. Shared by every endpoint
    that reads the whole document: 404 for someone else's, 409 when it can't be read yet."""
    document = await _get_owned_document(document_id, user, session)

    if document.status not in SEARCHABLE_STATUSES:
        raise HTTPException(status_code=409, detail="document is not ready to read yet")

    clause_count = await session.scalar(
        select(func.count()).select_from(Clause).where(Clause.document_id == document.id)
    )
    if not clause_count:
        raise HTTPException(status_code=409, detail="document has no readable text")

    return document


@app.get(
    "/documents/{document_id}/key-terms",
    tags=["answers"],
    summary="Show the key terms of a document",
    description=(
        "Returns the facts worth knowing for this kind of document, each with the checked quotes behind it, or marked as not mentioned. Read once and saved."
    ),
    responses=_errors(401, 404, 409, 429, 502),
)
async def document_key_terms(
    document_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> KeyTermsResult:
    """The key facts for this document, each backed by a verified quote. The first request
    reads the document once and saves the result, so later requests are free. Safe to call
    again, which is why this is a GET even though the first call does the work."""
    document = await _get_readable_document(document_id, user, session)

    # Only a first request, one that has to call the model, counts against the daily limit.
    # Reading what was already saved is free, so reaching the limit never locks anyone out of it.
    if await load_key_terms(session, document.id, document.doc_type) is None:
        await _spend_or_refuse(session, user, "analyze")
    try:
        return await get_key_terms(session, document.id, document.doc_type)
    except (KeyTermsGenerationError, genai_errors.APIError) as exc:
        logger.warning("model call failed: %s", describe_failure(exc))
        raise HTTPException(
            status_code=502, detail="the reading service is unavailable, try again"
        ) from exc


@app.get(
    "/documents/{document_id}/checklist",
    tags=["answers"],
    summary="Show the questions to ask before signing",
    description=(
        "Returns the must-ask questions for this kind of document, each answered with checked quotes or flagged as a gap with wording for asking the other side. Read once and saved."
    ),
    responses=_errors(401, 404, 409, 429, 502),
)
async def document_checklist(
    document_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ChecklistResult:
    """The must-ask questions for this kind of document, each answered with the exact quotes
    behind it, or marked not mentioned. An important question the document does not answer
    comes back flagged as a gap, with wording for asking the other side. Like key terms, the
    first request does the work and later ones read the saved copy."""
    document = await _get_readable_document(document_id, user, session)

    if await load_checklist(session, document.id, document.doc_type) is None:
        await _spend_or_refuse(session, user, "analyze")
    try:
        return await get_checklist(session, document.id, document.doc_type)
    except (ChecklistGenerationError, genai_errors.APIError) as exc:
        logger.warning("model call failed: %s", describe_failure(exc))
        raise HTTPException(
            status_code=502, detail="the reading service is unavailable, try again"
        ) from exc
