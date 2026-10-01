import uuid

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db import get_session
from app.ingestion import ingest_document
from app.models import Document, User
from app.retrieval import hybrid_search, reranked_search
from app.storage import (
    ALLOWED_CONTENT_TYPES,
    MAX_FILE_SIZE_BYTES,
    build_storage_key,
    create_presigned_upload_url,
)

SEARCHABLE_STATUSES = {"ready", "needs_retake"}

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
    await session.commit()
    await session.refresh(document)

    background_tasks.add_task(ingest_document, document.id)

    return DocumentSummary(
        id=str(document.id),
        filename=document.filename,
        doc_type=document.doc_type,
        status=document.status,
    )


@app.get("/documents")
async def list_documents(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[DocumentSummary]:
    result = await session.execute(
        select(Document).where(Document.user_id == user.id).order_by(Document.created_at.desc())
    )
    documents = result.scalars().all()

    return [
        DocumentSummary(
            id=str(d.id),
            filename=d.filename,
            doc_type=d.doc_type,
            status=d.status,
            ocr_confidence=d.ocr_confidence,
        )
        for d in documents
    ]


class SearchRequest(BaseModel):
    query: str
    limit: int = Field(default=10, ge=1, le=50)
    # Cross-encoder rerank puts the best clause first but adds latency; off is the fast path.
    rerank: bool = True


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
