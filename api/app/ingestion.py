import logging
import uuid

import pymupdf
from google import genai
from google.genai import types

from app.config import settings
from app.db import async_session
from app.models import EMBEDDING_DIM, Clause, Document, Embedding
from app.storage import download_file

logger = logging.getLogger(__name__)

# Gemini retired text-embedding-004; gemini-embedding-001 defaults to 3072 dims but
# supports requesting a smaller output via MRL truncation, so we ask for EMBEDDING_DIM
# to match the pgvector column. Only the default 3072-dim output comes pre-normalized,
# so smaller outputs need to be normalized by hand.
EMBEDDING_MODEL = "gemini-embedding-001"
CHUNK_SIZE_CHARS = 1500
EMBEDDING_BATCH_SIZE = 100

_client: genai.Client | None = None


def get_genai_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=settings.gemini_api_key)
    return _client


def extract_pages(pdf_bytes: bytes) -> list[str]:
    doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    try:
        return [page.get_text() for page in doc]
    finally:
        doc.close()


def chunk_page_text(text: str) -> list[tuple[int, int, str]]:
    """Splits one page's text into naive fixed-size chunks with soft boundaries.

    Returns a list of (char_start, char_end, chunk_text), offsets relative to this page.
    """
    chunks: list[tuple[int, int, str]] = []
    start = 0
    length = len(text)

    while start < length:
        end = min(start + CHUNK_SIZE_CHARS, length)
        if end < length:
            boundary = text.rfind("\n\n", start, end)
            if boundary == -1 or boundary <= start:
                boundary = text.rfind(". ", start, end)
            if boundary != -1 and boundary > start:
                end = boundary + 1

        chunk_text = text[start:end].strip()
        if chunk_text:
            chunks.append((start, end, chunk_text))
        start = end

    return chunks


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

            pdf_bytes = download_file(document.storage_key)
            pages = extract_pages(pdf_bytes)

            chunk_records: list[tuple[int, int, int, str]] = []
            for page_number, page_text in enumerate(pages, start=1):
                for char_start, char_end, chunk_text in chunk_page_text(page_text):
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

            document.status = "ready"
            await session.commit()
        except Exception:
            logger.exception("ingestion failed for document %s", document_id)
            await session.rollback()
            document = await session.get(Document, document_id)
            if document is not None:
                document.status = "failed"
                await session.commit()
