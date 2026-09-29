import math
import uuid

import pymupdf
from sqlalchemy import select

from app.ingestion import CHUNK_SIZE_CHARS, _normalize, chunk_page_text, ingest_document
from app.models import EMBEDDING_DIM, Clause, Document, Embedding, User


def _make_pdf_bytes(page_texts: list[str]) -> bytes:
    doc = pymupdf.open()
    for text in page_texts:
        page = doc.new_page()
        page.insert_text((72, 72), text)
    return doc.tobytes()


def _make_document(user: User, **overrides) -> Document:
    defaults = dict(
        user_id=user.id,
        filename="sample.pdf",
        doc_type="lease",
        status="uploaded",
        storage_key="fake/key.pdf",
        file_size_bytes=1024,
    )
    defaults.update(overrides)
    return Document(**defaults)


# --- chunk_page_text: pure logic, no database needed ---


def test_chunk_page_text_empty_string_returns_no_chunks():
    assert chunk_page_text("") == []


def test_chunk_page_text_short_text_returns_single_chunk():
    text = "A short clause."
    assert chunk_page_text(text) == [(0, len(text), text)]


def test_chunk_page_text_covers_every_character_exactly_once_in_order():
    text = "A" * (CHUNK_SIZE_CHARS * 2)
    chunks = chunk_page_text(text)

    assert len(chunks) == 2
    assert chunks[0][0] == 0
    assert chunks[-1][1] == len(text)
    cursor = 0
    for start, end, _ in chunks:
        assert start == cursor
        cursor = end


def test_chunk_page_text_prefers_paragraph_boundary_over_hard_cutoff():
    para1 = "Sentence one. " * 60  # well under CHUNK_SIZE_CHARS on its own
    para2 = "Sentence two. " * 60
    text = para1 + "\n\n" + para2  # combined length forces a chunk break

    chunks = chunk_page_text(text)

    assert len(chunks) == 2
    first_start, first_end, first_text = chunks[0]
    assert first_text == para1.strip()
    assert first_end < CHUNK_SIZE_CHARS  # broke at the paragraph, not the naive cutoff


# --- _normalize: pure logic, no database needed ---


def test_normalize_produces_a_unit_vector():
    normalized = _normalize([3.0, 4.0])
    magnitude = math.sqrt(sum(component * component for component in normalized))
    assert math.isclose(magnitude, 1.0, rel_tol=1e-9)


def test_normalize_handles_zero_vector_without_dividing_by_zero():
    assert _normalize([0.0, 0.0]) == [0.0, 0.0]


# --- ingest_document: real Postgres, real PyMuPDF, mocked network calls ---


async def test_ingest_document_creates_matching_clauses_and_embeddings(
    db_session, test_user, monkeypatch
):
    document = _make_document(test_user)
    db_session.add(document)
    await db_session.commit()
    await db_session.refresh(document)

    pdf_bytes = _make_pdf_bytes(["Page one clause text.", "Page two clause text."])

    monkeypatch.setattr("app.ingestion.download_file", lambda storage_key: pdf_bytes)
    monkeypatch.setattr(
        "app.ingestion.embed_texts",
        lambda texts: [[0.1] * EMBEDDING_DIM for _ in texts],
    )

    await ingest_document(document.id)

    await db_session.refresh(document)
    assert document.status == "ready"

    clauses = (
        await db_session.execute(select(Clause).where(Clause.document_id == document.id))
    ).scalars().all()
    assert len(clauses) == 2
    assert {c.page_number for c in clauses} == {1, 2}

    embeddings = (
        await db_session.execute(
            select(Embedding).where(Embedding.clause_id.in_([c.id for c in clauses]))
        )
    ).scalars().all()
    assert len(embeddings) == 2
    assert all(len(e.vector) == EMBEDDING_DIM for e in embeddings)


async def test_ingest_document_marks_failed_when_embedding_call_errors(
    db_session, test_user, monkeypatch
):
    document = _make_document(test_user)
    db_session.add(document)
    await db_session.commit()
    await db_session.refresh(document)

    pdf_bytes = _make_pdf_bytes(["Some real page text."])

    def _raise(texts: list[str]):
        raise RuntimeError("embedding api unavailable")

    monkeypatch.setattr("app.ingestion.download_file", lambda storage_key: pdf_bytes)
    monkeypatch.setattr("app.ingestion.embed_texts", _raise)

    await ingest_document(document.id)

    await db_session.refresh(document)
    assert document.status == "failed"

    clauses = (
        await db_session.execute(select(Clause).where(Clause.document_id == document.id))
    ).scalars().all()
    assert clauses == []


async def test_ingest_document_marks_failed_when_pdf_has_no_extractable_text(
    db_session, test_user, monkeypatch
):
    document = _make_document(test_user)
    db_session.add(document)
    await db_session.commit()
    await db_session.refresh(document)

    blank_pdf = pymupdf.open()
    blank_pdf.new_page()

    monkeypatch.setattr("app.ingestion.download_file", lambda storage_key: blank_pdf.tobytes())

    await ingest_document(document.id)

    await db_session.refresh(document)
    assert document.status == "failed"


async def test_ingest_document_does_nothing_for_missing_document_id():
    # should log and return quietly, not raise, since the document row simply doesn't exist
    await ingest_document(uuid.uuid4())
