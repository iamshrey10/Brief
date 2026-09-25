import uuid

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db import get_session
from app.models import Document, User
from app.storage import (
    ALLOWED_CONTENT_TYPES,
    MAX_FILE_SIZE_BYTES,
    build_storage_key,
    create_presigned_upload_url,
)

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
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> DocumentSummary:
    document = await _get_owned_document(document_id, user, session)
    document.status = "uploaded"
    await session.commit()
    await session.refresh(document)

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
        DocumentSummary(id=str(d.id), filename=d.filename, doc_type=d.doc_type, status=d.status)
        for d in documents
    ]
