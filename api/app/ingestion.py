import logging
import uuid

import pymupdf
from google import genai
from google.genai import types

from app.clause_segmentation import segment_page_into_clauses
from app.config import settings
from app.db import async_session
from app.image_processing import OCR_CONFIDENCE_THRESHOLD, ocr_image
from app.models import EMBEDDING_DIM, Clause, Document, Embedding
from app.storage import download_file

logger = logging.getLogger(__name__)

# Gemini retired text-embedding-004; gemini-embedding-001 defaults to 3072 dims but
# supports requesting a smaller output via MRL truncation, so we ask for EMBEDDING_DIM
# to match the pgvector column. Only the default 3072-dim output comes pre-normalized,
# so smaller outputs need to be normalized by hand.
EMBEDDING_MODEL = "gemini-embedding-001"
EMBEDDING_BATCH_SIZE = 100

_client: genai.Client | None = None


def get_genai_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=settings.gemini_api_key)
    return _client


def extract_pages(file_bytes: bytes, content_type: str) -> tuple[list[str], float | None]:
    """Returns (page_texts, ocr_confidence). Confidence is None for born-digital PDFs,
    which don't go through OCR at all."""
    if content_type.startswith("image/"):
        text, confidence = ocr_image(file_bytes)
        return [text], confidence

    doc = pymupdf.open(stream=file_bytes, filetype="pdf")
    try:
        return [page.get_text() for page in doc], None
    finally:
        doc.close()


def _normalize(vector: list[float]) -> list[float]:
    norm = sum(component * component for component in vector) ** 0.5
    if norm == 0:
        return vector
    return [component / norm for component in vector]


def embed_texts(texts: list[str]) -> list[list[float]]:
    client = get_genai_client()
    config = types.EmbedContentConfig(output_dimensionality=EMBEDDING_DIM)
    vectors: list[list[float]] = []

    for batch_start in range(0, len(texts), EMBEDDING_BATCH_SIZE):
        batch = texts[batch_start : batch_start + EMBEDDING_BATCH_SIZE]
        response = client.models.embed_content(model=EMBEDDING_MODEL, contents=batch, config=config)
        vectors.extend(_normalize(embedding.values) for embedding in response.embeddings)

    return vectors


async def ingest_document(document_id: uuid.UUID) -> None:
    async with async_session() as session:
        document = await session.get(Document, document_id)
        if document is None:
            logger.error("ingest_document called for missing document %s", document_id)
            return

        try:
            document.status = "processing"
            await session.commit()

            file_bytes = download_file(document.storage_key)
            pages, ocr_confidence = extract_pages(file_bytes, document.content_type)
            document.ocr_confidence = ocr_confidence

            chunk_records: list[tuple[int, int, int, str]] = []
            for page_number, page_text in enumerate(pages, start=1):
                for char_start, char_end, chunk_text in segment_page_into_clauses(page_text):
                    chunk_records.append((page_number, char_start, char_end, chunk_text))

            if not chunk_records:
                document.status = "failed"
                await session.commit()
                logger.error("no extractable text found in document %s", document_id)
                return

            vectors = embed_texts([text for *_rest, text in chunk_records])

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
                document.status = "needs_retake"
            else:
                document.status = "ready"
            await session.commit()
        except Exception:
            logger.exception("ingestion failed for document %s", document_id)
            await session.rollback()
            document = await session.get(Document, document_id)
            if document is not None:
                document.status = "failed"
                await session.commit()
