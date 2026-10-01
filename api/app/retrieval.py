import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ingestion import embed_texts
from app.models import Clause, Embedding

DEFAULT_LIMIT = 10


async def keyword_search(
    session: AsyncSession, document_id: uuid.UUID, query: str, limit: int = DEFAULT_LIMIT
) -> list[tuple[uuid.UUID, float]]:
    """Ranks a document's clauses by Postgres full-text relevance to `query`.

    Returns (clause_id, rank) pairs, highest rank first. Catches exact-term matches
    that pure vector search can miss, dollar figures, defined terms, section numbers.
    """
    tsquery = func.plainto_tsquery("english", query)
    rank = func.ts_rank(Clause.search_vector, tsquery).label("rank")

    statement = (
        select(Clause.id, rank)
        .where(Clause.document_id == document_id)
        .where(Clause.search_vector.op("@@")(tsquery))
        .order_by(rank.desc())
        .limit(limit)
    )

    result = await session.execute(statement)
    return [(row.id, row.rank) for row in result]


def embed_query(query: str) -> list[float]:
    """Embeds a search query with the same model and dimension used for clauses, so
    the two are directly comparable in vector_search."""
    return embed_texts([query])[0]


async def vector_search(
    session: AsyncSession,
    document_id: uuid.UUID,
    query_embedding: list[float],
    limit: int = DEFAULT_LIMIT,
) -> list[tuple[uuid.UUID, float]]:
    """Ranks a document's clauses by cosine distance to `query_embedding`.

    Returns (clause_id, distance) pairs, closest first. Catches paraphrased questions
    that keyword_search misses entirely, since it matches on meaning, not exact words.
    """
    distance = Embedding.vector.cosine_distance(query_embedding).label("distance")

    statement = (
        select(Clause.id, distance)
        .join(Embedding, Embedding.clause_id == Clause.id)
        .where(Clause.document_id == document_id)
        .order_by(distance.asc())
        .limit(limit)
    )

    result = await session.execute(statement)
    return [(row.id, row.distance) for row in result]
