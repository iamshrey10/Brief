import asyncio
import contextlib
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
from app.db import async_session, get_session
from app.housekeeping import (
    purge_expired_trash,
    remove_abandoned_uploads,
    remove_document_for_good,
    remove_old_traces,
    trash_days_left,
)
from app.ingestion import ingest_document
from app.logging_setup import configure_logging
from app.readiness import check_ready
from app import request_id
from app.insights import DocumentInsight, saved_insights
from app.key_dates import KeyDate, saved_key_dates
from app.key_terms import KeyTermsGenerationError, KeyTermsResult, get_key_terms, load_key_terms
from app import sharing
from app.filing import FilingError, file_document
from app.folders import FOLDERS, folder_for
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
    create_presigned_view_url,
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

# How often the bin is swept for documents past their time, whoever owns them.
TRASH_SWEEP_EVERY_SECONDS = 3600


async def sweep_trash_forever() -> None:
    """Removes expired bin documents now and then, for as long as the server runs, so a document goes on time even when its owner
    never comes back. A failed sweep is logged and tried again at the next one."""
    while True:
        try:
            async with async_session() as session:
                removed = await purge_expired_trash(session)
            if removed:
                logger.info("removed expired documents from the bin")
        except Exception:
            logger.exception("the sweep of the bin failed")
        await asyncio.sleep(TRASH_SWEEP_EVERY_SECONDS)


@contextlib.asynccontextmanager
async def lifespan(_app: FastAPI):
    sweeper = asyncio.create_task(sweep_trash_forever())
    try:
        yield
    finally:
        sweeper.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await sweeper


app = FastAPI(
    lifespan=lifespan,
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
        {"name": "sharing", "description": "Letting someone else look at your dashboard, read only, and looking at one shared with you."},
    ],
    **docs_urls(settings.environment),
)


# What each error answer means, for the API documentation. A test checks that every route documents the
# errors its code can really give, and no others.
_ERROR_MEANINGS = {
    400: "The request is not valid: the message says what is wrong.",
    401: "Not signed in, or the token has expired.",
    404: "There is no such document, invitation or shared dashboard, or it belongs to someone else.",
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


class Me(BaseModel):
    id: str
    email: str
    # What the person told us after their first sign in. None until they have.
    first_name: str | None = None
    last_name: str | None = None


@app.get(
    "/me",
    tags=["account"],
    summary="Show who is signed in",
    description=(
        "Returns the id, email and name of the signed-in person. The name is empty until they have given it."
    ),
    responses=_errors(401),
)
async def me(user: User = Depends(get_current_user)) -> Me:
    return Me(id=str(user.id), email=user.email, first_name=user.first_name, last_name=user.last_name)


class NameRequest(BaseModel):
    first_name: str
    last_name: str

    @field_validator("first_name", "last_name")
    @classmethod
    def _a_plain_name(cls, value: str) -> str:
        value = " ".join(value.split())
        if not 1 <= len(value) <= 50:
            raise ValueError("a name is between 1 and 50 characters")
        if any(not (ch.isalpha() or ch in " '-.") for ch in value):
            raise ValueError("a name has letters, spaces, hyphens, apostrophes and full stops only")
        return value


@app.patch(
    "/me",
    tags=["account"],
    summary="Set your first and last name",
    description=(
        "Saves the signed-in person's first and last name, which other people see in place of an email address when a dashboard is shared. Each is 1 to 50 letters, with spaces, hyphens, apostrophes and full stops allowed."
    ),
    responses=_errors(401),
)
async def set_my_name(
    body: NameRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Me:
    # Read again in this request's own session, so the change is saved whichever session found the person.
    person = await session.get(User, user.id)
    person.first_name = body.first_name
    person.last_name = body.last_name
    await session.commit()
    await session.refresh(person)
    return Me(id=str(person.id), email=person.email, first_name=person.first_name, last_name=person.last_name)


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


@app.get(
    "/me/insights",
    tags=["account"],
    summary="Show what Brief has worked out about your documents",
    description=(
        "Returns, for each document that has been opened, how many key terms were found and how many questions the document answers, with the wording to ask the other side for the important ones it leaves open. Only results that were already saved are included, so this never calls the model and never counts against a daily limit."
    ),
    responses=_errors(401),
)
async def my_insights(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[DocumentInsight]:
    """What is already saved about this person's documents. Looking uses nothing up."""
    return await saved_insights(session, user.id)


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
    # One of the five storage folders. Left out, the file goes in the folder for its kind.
    folder: str | None = None


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
    if body.folder is not None and body.folder not in FOLDERS:
        raise HTTPException(status_code=400, detail="unknown folder")
    if body.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="unsupported file type")
    if body.file_size_bytes <= 0 or body.file_size_bytes > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="file is too large, 50MB max")

    # Uploads this person started and never confirmed would otherwise hold a slot for ever. Cleared only
    # now that the request is known to be valid, so a refused request changes nothing.
    await remove_abandoned_uploads(session, user.id)
    await remove_old_traces(session, user.id)
    await purge_expired_trash(session, user_id=user.id)
    kept = await _live_document_count(session, user)
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

    folder = folder_for(body.doc_type, body.folder)
    storage_key = build_storage_key(str(user.id), filename, folder)

    document = Document(
        user_id=user.id,
        filename=filename,
        doc_type=body.doc_type,
        status="pending",
        storage_key=storage_key,
        folder=folder,
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
    # Which storage folder the file is in.
    folder: str = "Other"
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
            folder=document.folder,
            failure_reason=document.failure_reason,
            progress_done=document.progress_done,
            progress_total=document.progress_total,
        )


async def _live_document_count(session: AsyncSession, user: User) -> int:
    """How many documents the person has in use. The ones in the bin do not count, so moving one there frees a place."""
    return await session.scalar(
        select(func.count()).select_from(Document).where(Document.user_id == user.id, Document.deleted_at.is_(None))
    )


async def _get_owned_document(
    document_id: str, user: User, session: AsyncSession, *, in_bin: bool = False
) -> Document:
    """The person's own document, or a 404. A document in the bin is, to everything else, not there at all: it is found only
    when the bin itself asks for it with `in_bin`, and a document in use is then not found, so each caller gets one or the other."""
    try:
        doc_uuid = uuid.UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="document not found") from None

    result = await session.execute(select(Document).where(Document.id == doc_uuid))
    document = result.scalar_one_or_none()

    if document is None or document.user_id != user.id or (document.deleted_at is not None) != in_bin:
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
    summary="Move a document to the bin",
    description=(
        "Hides the document everywhere and keeps its file and everything read from it, so it can be restored from the bin for seven days. After that it is removed for good. Moving something that is already in the bin is a 404."
    ),
    responses=_errors(401, 404),
)
async def delete_document(
    document_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    """Moves a document to the bin. Nothing is removed: the file, the pieces, the embeddings, the key terms and the checklist
    answers stay where they are, so a restore brings back exactly what was there, in the same kind and with the same name."""
    document = await _get_owned_document(document_id, user, session)
    document.deleted_at = datetime.now(timezone.utc)
    await session.commit()
    return Response(status_code=204)


class TrashedDocument(BaseModel):
    id: str
    filename: str
    doc_type: str
    deleted_at: datetime
    # Whole days left to restore it, counting a part of a day as a day.
    days_left: int


class MoveRequest(BaseModel):
    folder: str


@app.post(
    "/documents/{document_id}/move",
    tags=["documents"],
    summary="Move a document to another folder",
    description=(
        "Moves the stored file to one of the five folders: Lease, Education_Loan, Job_Offers, Personal_Documents or Other. The file is copied and checked before the old one is removed, so a failure leaves it where it was. A document still uploading or in the bin cannot be moved."
    ),
    responses=_errors(400, 401, 404, 409, 502),
)
async def move_document(
    document_id: str,
    body: MoveRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> DocumentSummary:
    if body.folder not in FOLDERS:
        raise HTTPException(status_code=400, detail="unknown folder")
    document = await _get_owned_document(document_id, user, session)
    if document.status == "pending":
        raise HTTPException(status_code=409, detail="the file is still uploading")
    try:
        await file_document(session, document, body.folder)
    except FilingError as error:
        logger.warning("could not move a document to another folder")
        raise HTTPException(status_code=502, detail="could not move the file, it is still where it was") from error
    await session.refresh(document)
    return DocumentSummary.from_document(document)


class DocumentFileLink(BaseModel):
    url: str
    content_type: str


@app.get(
    "/documents/{document_id}/file",
    tags=["documents"],
    summary="Get a short-lived link to view the original file",
    description=(
        "Returns a link, valid for five minutes, that shows the document exactly as it was uploaded. Only the person who owns the document can ask, and a document in the bin cannot be viewed."
    ),
    responses=_errors(401, 404),
)
async def view_document_file(
    document_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> DocumentFileLink:
    document = await _get_owned_document(document_id, user, session)
    url = await asyncio.to_thread(
        create_presigned_view_url, document.storage_key, document.content_type, document.filename
    )
    return DocumentFileLink(url=url, content_type=document.content_type)


@app.get(
    "/trash",
    tags=["documents"],
    summary="List the documents in your bin",
    description=(
        "Returns the signed-in person's documents that were moved to the bin, the most recently deleted first, with when each was deleted and how many days are left to restore it. Documents past their seven days are removed for good before the list is made."
    ),
    responses=_errors(401),
)
async def list_trash(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[TrashedDocument]:
    await purge_expired_trash(session, user_id=user.id)
    result = await session.execute(
        select(Document)
        .where(Document.user_id == user.id, Document.deleted_at.is_not(None))
        .order_by(Document.deleted_at.desc())
    )
    now = datetime.now(timezone.utc)
    return [
        TrashedDocument(
            id=str(document.id),
            filename=document.filename,
            doc_type=document.doc_type,
            deleted_at=document.deleted_at,
            days_left=trash_days_left(document.deleted_at, now),
        )
        for document in result.scalars().all()
    ]


@app.post(
    "/documents/{document_id}/restore",
    tags=["documents"],
    summary="Restore a document from the bin",
    description=(
        "Brings a document back from the bin, with its name, kind and everything read from it as they were. Refused when the person already has the most documents they can keep, and not found once the document has been in the bin longer than it is kept."
    ),
    responses=_errors(401, 404, 409),
)
async def restore_document(
    document_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> DocumentSummary:
    document = await _get_owned_document(document_id, user, session, in_bin=True)
    if trash_days_left(document.deleted_at) == 0:
        # Past its time. It is removed at the next sweep, and until then it cannot be brought back.
        raise HTTPException(status_code=404, detail="document not found")
    if await _live_document_count(session, user) >= MAX_DOCUMENTS_PER_USER:
        raise HTTPException(
            status_code=409,
            detail=f"You can keep up to {MAX_DOCUMENTS_PER_USER} documents. Move one to the bin to restore this one.",
        )
    document.deleted_at = None
    await session.commit()
    await session.refresh(document)
    return DocumentSummary.from_document(document)


@app.delete(
    "/documents/{document_id}/permanent",
    status_code=204,
    tags=["documents"],
    summary="Delete a document from the bin for good",
    description=(
        "Removes the stored file first and then the document and everything read from it. Only a document that is in the bin can be removed this way, so a document in use is never deleted by one click."
    ),
    responses=_errors(401, 404, 502),
)
async def delete_document_for_good(
    document_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    """The file goes first. If storage fails, the document is kept in the bin, so this can simply be tried again."""
    document = await _get_owned_document(document_id, user, session, in_bin=True)
    if not await remove_document_for_good(session, document):
        raise HTTPException(status_code=502, detail="could not remove the file, nothing was deleted")
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
        select(Document)
        .where(Document.user_id == user.id, Document.deleted_at.is_(None))
        .order_by(Document.created_at.desc())
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


class CreateShareRequest(BaseModel):
    # Who it is for, in the owner's words, so the list of invitations can be told apart.
    label: str | None = Field(default=None, max_length=100)

    @field_validator("label")
    @classmethod
    def _trim_label(cls, value: str | None) -> str | None:
        return (value or "").strip() or None


class ShareCreated(BaseModel):
    id: str
    # The secret part of the link and the six digit code. They are shown this once and kept only as hashes.
    token: str
    code: str
    expires_at: datetime


class ShareInfo(BaseModel):
    id: str
    label: str | None
    # invited (nobody has used it yet), requested (waiting for you to approve), or active
    status: str
    viewer_email: str | None
    viewer_name: str | None = None
    created_at: datetime
    expires_at: datetime | None
    last_viewed_at: datetime | None


@app.post(
    "/shares",
    status_code=201,
    tags=["sharing"],
    summary="Invite someone to view your dashboard",
    description=(
        "Makes an invitation: a link and a six digit code, shown once. The other person signs in, opens the link and enters the code, and then you approve them. At most five people can have access, counting invitations still waiting. An invitation not approved within seven days stops working."
    ),
    responses=_errors(401, 409),
)
async def create_share(
    body: CreateShareRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ShareCreated:
    made = await sharing.create_share(session, user, body.label)
    if made is None:
        raise HTTPException(
            status_code=409,
            detail=f"You can share your dashboard with up to {sharing.MAX_SHARES} people. Remove someone to invite another.",
        )
    share, token, code = made
    return ShareCreated(id=str(share.id), token=token, code=code, expires_at=share.expires_at)


@app.get(
    "/shares",
    tags=["sharing"],
    summary="List who can view your dashboard",
    description=(
        "Returns the invitations you made that are still usable, the people waiting for your approval, and the people who can view your dashboard, with when each last looked. Codes and links are never included."
    ),
    responses=_errors(401),
)
async def list_shares(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[ShareInfo]:
    shares = await sharing.owner_shares(session, user.id)
    people: dict[uuid.UUID, tuple[str, str | None]] = {}
    viewer_ids = [share.viewer_id for share in shares if share.viewer_id]
    if viewer_ids:
        found = await session.execute(select(User).where(User.id.in_(viewer_ids)))
        people = {u.id: (u.email, sharing.display_name(u.first_name, u.last_name)) for u in found.scalars().all()}
    return [
        ShareInfo(
            id=str(share.id),
            label=share.label,
            status=share.status,
            viewer_email=people.get(share.viewer_id, (None, None))[0],
            viewer_name=people.get(share.viewer_id, (None, None))[1],
            created_at=share.created_at,
            expires_at=None if share.status == "active" else share.expires_at,
            last_viewed_at=share.last_viewed_at,
        )
        for share in shares
    ]


@app.post(
    "/shares/{share_id}/approve",
    tags=["sharing"],
    summary="Approve someone who entered the code",
    description=(
        "Lets the person who entered the code from your invitation view your dashboard, read only. Only works on a request that is waiting for you."
    ),
    responses=_errors(401, 404, 409),
)
async def approve_share(
    share_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    outcome = await sharing.approve_share(session, user, share_id)
    if outcome is sharing.Decision.MISSING:
        raise HTTPException(status_code=404, detail="share not found")
    if outcome is sharing.Decision.NOT_NOW:
        raise HTTPException(status_code=409, detail="there is no request waiting to approve")
    return {"status": "active"}


@app.delete(
    "/shares/{share_id}",
    status_code=204,
    tags=["sharing"],
    summary="Stop sharing, or turn down a request",
    description=(
        "Ends an invitation, declines a request or removes someone's access at once. Whoever had the link or access can no longer open anything."
    ),
    responses=_errors(401, 404),
)
async def revoke_share(
    share_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    if not await sharing.revoke_share(session, user, share_id):
        raise HTTPException(status_code=404, detail="share not found")
    return Response(status_code=204)


class JoinRequest(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    code: str = Field(pattern=r"^\d{6}$")


class JoinedShare(BaseModel):
    owner_email: str
    owner_name: str | None = None
    status: str


@app.post(
    "/shares/join",
    tags=["sharing"],
    summary="Use an invitation to ask for access",
    description=(
        "The signed-in person enters the code from an invitation link. A right code sends the owner a request to approve. Five wrong codes end the invitation, and an unknown, used or expired one is answered the same way as a missing one."
    ),
    responses=_errors(400, 401, 404, 409),
)
async def join_share(
    body: JoinRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> JoinedShare:
    outcome, share = await sharing.join_share(session, user, body.token, body.code)
    if outcome is sharing.Joined.INVALID:
        raise HTTPException(status_code=404, detail="that invitation is not valid any more")
    if outcome is sharing.Joined.WRONG_CODE:
        raise HTTPException(status_code=400, detail="that code is not right")
    if outcome is sharing.Joined.OWN:
        raise HTTPException(status_code=400, detail="that is your own invitation")
    if outcome is sharing.Joined.ALREADY:
        raise HTTPException(status_code=409, detail="you already have access to that dashboard")
    owner = await session.get(User, share.owner_id)
    return JoinedShare(owner_email=owner.email, owner_name=sharing.display_name(owner.first_name, owner.last_name), status="requested")


class SharedWithMe(BaseModel):
    id: str
    owner_email: str
    owner_name: str | None = None
    # requested (waiting for the owner) or active
    status: str


@app.get(
    "/shared",
    tags=["sharing"],
    summary="List dashboards shared with you",
    description=(
        "Returns the dashboards other people have approved you to view, and the requests still waiting for their answer."
    ),
    responses=_errors(401),
)
async def list_shared_with_me(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[SharedWithMe]:
    return [
        SharedWithMe(
            id=str(share.id),
            owner_email=owner.email,
            owner_name=sharing.display_name(owner.first_name, owner.last_name),
            status=share.status,
        )
        for share, owner in await sharing.shared_with(session, user.id)
    ]


class SharedTerm(BaseModel):
    label: str
    value: str


class SharedDocument(DocumentSummary):
    # What was found in the document, in plain words. Only the label and the value: the quotes and where they came from stay with the owner.
    key_terms: list[SharedTerm] = []


class SharedDashboard(BaseModel):
    owner_email: str
    owner_name: str | None = None
    documents: list[SharedDocument]
    insights: list[DocumentInsight]
    key_dates: list[KeyDate]


@app.get(
    "/shared/{share_id}/dashboard",
    tags=["sharing"],
    summary="View a dashboard shared with you",
    description=(
        "Returns what the owner's dashboard shows: their documents with their status, what was found in each, and the dates found. Read only, and it never includes the files themselves or lets anything be asked, changed or deleted. Answers 404 once the owner removes access."
    ),
    responses=_errors(401, 404),
)
async def view_shared_dashboard(
    share_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> SharedDashboard:
    found = await sharing.viewable_share(session, user, share_id)
    if found is None:
        raise HTTPException(status_code=404, detail="shared dashboard not found")
    _, owner = found
    owner_id, owner_email = owner.id, owner.email
    owner_name = sharing.display_name(owner.first_name, owner.last_name)
    result = await session.execute(
        select(Document)
        .where(Document.user_id == owner_id, Document.deleted_at.is_(None))
        .order_by(Document.created_at.desc())
    )
    documents: list[SharedDocument] = []
    for document in result.scalars().all():
        saved = await load_key_terms(session, document.id, document.doc_type)
        terms = [SharedTerm(label=t.label, value=t.value) for t in saved.terms if t.found and t.value] if saved else []
        documents.append(SharedDocument(**DocumentSummary.from_document(document).model_dump(), key_terms=terms))
    return SharedDashboard(
        owner_email=owner_email,
        owner_name=owner_name,
        documents=documents,
        insights=await saved_insights(session, owner_id),
        key_dates=await saved_key_dates(session, owner_id),
    )
