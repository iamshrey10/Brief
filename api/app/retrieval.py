import asyncio
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ingestion import embed_texts
from app.models import Clause, Embedding
from app.reranker import rerank

DEFAULT_LIMIT = 10

# How many hybrid results the cross-encoder gets to re-judge. Wide enough that the
# truly best clause is almost certainly in the shortlist, narrow enough to stay fast.
RERANK_CANDIDATES = 20

# Standard smoothing constant for reciprocal rank fusion, keeps a single very high rank
# from one list alone from completely dominating the combined score.
RRF_K = 60


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


async def hybrid_search(
    session: AsyncSession, document_id: uuid.UUID, query: str, limit: int = DEFAULT_LIMIT
) -> list[Clause]:
    """Combines keyword and vector search via reciprocal rank fusion (RRF).

    A clause that ranks well in either list contributes to its combined score, based
    purely on rank position, not the raw scores, which avoids having to normalize two
    differently-scaled signals (a ts_rank score and a cosine distance) against each
    other directly. Pulls more candidates from each underlying search than `limit`
    asks for, since fusion needs a real pool to combine before trimming to the top N.
    """
    query_embedding = embed_query(query)
    candidate_pool = limit * 2

    keyword_results = await keyword_search(session, document_id, query, limit=candidate_pool)
    vector_results = await vector_search(session, document_id, query_embedding, limit=candidate_pool)

    scores: dict[uuid.UUID, float] = {}
    for rank, (clause_id, _score) in enumerate(keyword_results):
        scores[clause_id] = scores.get(clause_id, 0.0) + 1.0 / (RRF_K + rank + 1)
    for rank, (clause_id, _score) in enumerate(vector_results):
        scores[clause_id] = scores.get(clause_id, 0.0) + 1.0 / (RRF_K + rank + 1)

    ranked_ids = sorted(scores, key=lambda clause_id: scores[clause_id], reverse=True)[:limit]
    if not ranked_ids:
        return []

    result = await session.execute(select(Clause).where(Clause.id.in_(ranked_ids)))
    clauses_by_id = {clause.id: clause for clause in result.scalars().all()}
    return [clauses_by_id[clause_id] for clause_id in ranked_ids if clause_id in clauses_by_id]


async def reranked_search(
    session: AsyncSession, document_id: uuid.UUID, query: str, limit: int = DEFAULT_LIMIT
) -> list[Clause]:
    """hybrid_search for a shortlist, then a cross-encoder re-judges that shortlist.

    The two stages play different roles: hybrid search is fast and wide, good at not
    missing the right clause, while the cross-encoder is slower and precise, good at
    putting the right clause first. The rerank runs in a worker thread because it's
    blocking CPU work that would otherwise stall every other request on the event loop.
    """
    candidates = await hybrid_search(session, document_id, query, limit=RERANK_CANDIDATES)
    if not candidates:
        return []

    ranked = await asyncio.to_thread(
        rerank, query, [(clause.id, clause.text) for clause in candidates], limit
    )

    clauses_by_id = {clause.id: clause for clause in candidates}
    return [clauses_by_id[clause_id] for clause_id, _score in ranked]
