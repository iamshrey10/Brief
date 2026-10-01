import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Clause

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
