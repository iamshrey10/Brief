import asyncio
import logging
import re
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Response
from google.genai import errors as genai_errors
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import delete, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.checklist import ChecklistGenerationError, ChecklistResult, get_checklist
from app.db import get_session
from app.ingestion import ingest_document
from app.key_terms import KeyTermsGenerationError, KeyTermsResult, get_key_terms
from app.models import ChecklistAnswerRow, Clause, Document, Extraction, User
from app.qa import AnswerGenerationError, AnswerResult, answer_question
from app.retrieval import hybrid_search, reranked_search
from app.storage import (
    ALLOWED_CONTENT_TYPES,
    MAX_FILE_SIZE_BYTES,
    build_storage_key,
    create_presigned_upload_url,
    delete_file,
)

logger = logging.getLogger(__name__)

SEARCHABLE_STATUSES = {"ready", "needs_retake"}

# How many documents one person can keep at a time. Every document costs storage and a read on
# a metered service, so this keeps one account from running up the bill. Deleting frees a slot.
MAX_DOCUMENTS_PER_USER = 25

# A document still being read this long after it was uploaded is stuck. Reading a long one can
# legitimately take several minutes while it waits out the embedding rate limit, so this leaves
# plenty of room before anyone can start a second read.
STUCK_AFTER = timedelta(minutes=15)

app = FastAPI(title="Brief API")

DOC_TYPES = {"loan", "lease", "offer", "other"}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/db")
async def health_db(session: AsyncSession = Depends(get_session)) -> dict[str, str]:
    await session.execute(text("SELECT 1"))
    return {"status": "ok"}


@app.get("/me")
async def me(user: User = Depends(get_current_user)) -> dict[str, str]:
    return {"id": str(user.id), "email": user.email}


class CreateUploadRequest(BaseModel):
    filename: str
    doc_type: str
    content_type: str
    file_size_bytes: int


class CreateUploadResponse(BaseModel):
    document_id: str
    upload_url: str


@app.post("/documents")
async def create_upload(
    body: CreateUploadRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> CreateUploadResponse:
    if body.doc_type not in DOC_TYPES:
        raise HTTPException(status_code=400, detail="unknown document type")
    if body.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="unsupported file type")
    if body.file_size_bytes <= 0 or body.file_size_bytes > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="file is too large, 50MB max")

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

    storage_key = build_storage_key(str(user.id), body.filename)

    document = Document(
        user_id=user.id,
        filename=body.filename,
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


@app.patch("/documents/{document_id}/confirm")
async def confirm_upload(
    document_id: str,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> DocumentSummary:
    document = await _get_owned_document(document_id, user, session)
    document.status = "uploaded"
    document.status_changed_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(document)

    background_tasks.add_task(ingest_document, document.id)

    return DocumentSummary.from_document(document)


@app.post("/documents/{document_id}/retry")
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


MAX_FILENAME_LENGTH = 200


class UpdateDocumentRequest(BaseModel):
    filename: str | None = None
    doc_type: str | None = None

    @field_validator("filename")
    @classmethod
    def _valid_filename(cls, value: str | None) -> str | None:
        if value is None:
            return None
        name = value.strip()
        if not name:
            raise ValueError("a name cannot be empty")
        if len(name) > MAX_FILENAME_LENGTH:
            raise ValueError(f"a name can be at most {MAX_FILENAME_LENGTH} characters")
        if re.search(r"[\x00-\x1f\x7f]", name):
            raise ValueError("a name cannot contain control characters")
        return name

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


@app.patch("/documents/{document_id}")
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


@app.delete("/documents/{document_id}", status_code=204)
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


@app.get("/documents")
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


@app.post("/documents/{document_id}/search")
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


@app.post("/documents/{document_id}/ask")
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

    try:
        return await answer_question(session, document.id, body.question)
    except (AnswerGenerationError, genai_errors.APIError) as exc:
        raise HTTPException(
            status_code=502, detail="the answering service is unavailable, try again"
        ) from exc


class ClauseOut(BaseModel):
    id: str
    clause_index: int
    page_number: int
    text: str


@app.get("/documents/{document_id}")
async def get_document(
    document_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> DocumentSummary:
    document = await _get_owned_document(document_id, user, session)

    return DocumentSummary.from_document(document)


@app.get("/documents/{document_id}/clauses")
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


@app.get("/documents/{document_id}/key-terms")
async def document_key_terms(
    document_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> KeyTermsResult:
    """The key facts for this document, each backed by a verified quote. The first request
    reads the document once and saves the result, so later requests are free. Safe to call
    again, which is why this is a GET even though the first call does the work."""
    document = await _get_readable_document(document_id, user, session)

    try:
        return await get_key_terms(session, document.id, document.doc_type)
    except (KeyTermsGenerationError, genai_errors.APIError) as exc:
        raise HTTPException(
            status_code=502, detail="the reading service is unavailable, try again"
        ) from exc


@app.get("/documents/{document_id}/checklist")
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

    try:
        return await get_checklist(session, document.id, document.doc_type)
    except (ChecklistGenerationError, genai_errors.APIError) as exc:
        raise HTTPException(
            status_code=502, detail="the reading service is unavailable, try again"
        ) from exc
