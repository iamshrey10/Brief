import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    Computed,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

# Gemini's gemini-embedding-001 defaults to 3072 dims but supports a smaller requested
# output; 768 keeps storage and query cost down. Revisit if the embedding model changes.
EMBEDDING_DIM = 768


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    documents: Mapped[list["Document"]] = relationship(back_populates="user")


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    filename: Mapped[str] = mapped_column(String(500))
    # loan, lease, offer, or other
    doc_type: Mapped[str] = mapped_column(String(50))
    # pending, uploaded, processing, ready, needs_retake, or failed
    status: Mapped[str] = mapped_column(String(50), default="pending")
    # where this file lives in object storage, not a public URL
    storage_key: Mapped[str] = mapped_column(String(500))
    file_size_bytes: Mapped[int] = mapped_column(Integer)
    content_type: Mapped[str] = mapped_column(String(100), default="application/pdf")
    # only set for image-sourced (OCR'd) documents, 0-100, null for born-digital PDFs
    ocr_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # When the status last changed. "Stuck" is measured from here, not from the upload, so a document
    # that was just retried is not stuck just because it was uploaded long ago. Null on rows that
    # existed before this column, which fall back to the upload time.
    status_changed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    user: Mapped["User"] = relationship(back_populates="documents")
    clauses: Mapped[list["Clause"]] = relationship(
        back_populates="document", cascade="all, delete-orphan"
    )
    extractions: Mapped[list["Extraction"]] = relationship(
        back_populates="document", cascade="all, delete-orphan"
    )
    checklist_answers: Mapped[list["ChecklistAnswerRow"]] = relationship(
        back_populates="document", cascade="all, delete-orphan"
    )


class Clause(Base):
    __tablename__ = "clauses"
    __table_args__ = (Index("ix_clauses_search_vector", "search_vector", postgresql_using="gin"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("documents.id"), index=True)
    clause_index: Mapped[int] = mapped_column(Integer)
    page_number: Mapped[int] = mapped_column(Integer)
    char_start: Mapped[int] = mapped_column(Integer)
    char_end: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text)
    # Postgres-generated, kept in sync automatically whenever text changes, used for
    # the keyword half of hybrid retrieval alongside the embeddings table's vectors.
    search_vector: Mapped[str] = mapped_column(
        TSVECTOR, Computed("to_tsvector('english', text)", persisted=True)
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    document: Mapped["Document"] = relationship(back_populates="clauses")
    embedding: Mapped["Embedding | None"] = relationship(
        back_populates="clause", cascade="all, delete-orphan", uselist=False
    )


class Embedding(Base):
    __tablename__ = "embeddings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clause_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clauses.id"), unique=True, index=True
    )
    vector: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIM))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    clause: Mapped["Clause"] = relationship(back_populates="embedding")


class Extraction(Base):
    """One key term for one document. Every field of the document type gets a row once
    extraction has run, so the rows existing at all means it already ran and the model
    isn't called again. A row with no value means the document doesn't state that term."""

    __tablename__ = "extractions"
    __table_args__ = (UniqueConstraint("document_id", "field_name", name="uq_extractions_field"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("documents.id"), index=True)
    clause_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("clauses.id"), nullable=True)
    field_name: Mapped[str] = mapped_column(String(100))
    # null when the document does not state this term
    value: Mapped[str | None] = mapped_column(Text, nullable=True)
    # the passage copied from the clause that backs the value, checked word for word
    quote: Mapped[str | None] = mapped_column(Text, nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    document: Mapped["Document"] = relationship(back_populates="extractions")


class ChecklistAnswerRow(Base):
    """One must-ask question for one document. Every question of the document type gets a row
    once the checklist has run, so the rows existing at all means it already ran and the model
    isn't called again. A row with no answer means the document does not answer that question.

    Which questions are important, and how to ask the other side, are deliberately not stored:
    they come from the question list when a row is read, so improving that wording improves
    documents that were already checked."""

    __tablename__ = "checklist_answers"
    __table_args__ = (
        UniqueConstraint("document_id", "question_id", name="uq_checklist_answers_question"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("documents.id"), index=True)
    question_id: Mapped[str] = mapped_column(String(100))
    # null when the document does not answer the question
    answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    # up to three {clause_id, page_number, quote} items, each quote checked word for word. The
    # page number is copied in so reading an answer needs no join, clauses never change after
    # ingestion.
    evidence: Mapped[list[dict]] = mapped_column(JSONB, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    document: Mapped["Document"] = relationship(back_populates="checklist_answers")
