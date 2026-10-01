import uuid
from functools import lru_cache
from pathlib import Path

from flashrank import Ranker, RerankRequest

# A small cross-encoder run through ONNX Runtime, no PyTorch, about 22MB. The even
# smaller ms-marco-TinyBERT-L-2-v2 was tried first and missed paraphrases a clause
# retrieval system has to handle ("pay off early" vs "repay ... prepayment penalty").
RERANK_MODEL = "ms-marco-MiniLM-L-12-v2"
MODEL_CACHE_DIR = Path.home() / ".cache" / "brief-flashrank"


@lru_cache(maxsize=1)
def _get_ranker() -> Ranker:
    MODEL_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    return Ranker(model_name=RERANK_MODEL, cache_dir=str(MODEL_CACHE_DIR), log_level="WARNING")


def rerank(
    query: str, candidates: list[tuple[uuid.UUID, str]], limit: int | None = None
) -> list[tuple[uuid.UUID, float]]:
    """Re-scores candidate clauses against the query with a cross-encoder.

    Unlike the embedding search that found these candidates, a cross-encoder reads the
    query and each clause together, so it judges relevance far more accurately, but is
    too slow to run over a whole document, which is why it only ever sees the shortlist
    hybrid_search already produced.

    Returns (clause_id, score) pairs, best first. Blocking CPU work, call it from async
    code via asyncio.to_thread.
    """
    if not candidates:
        return []

    passages = [{"id": position, "text": text} for position, (_clause_id, text) in enumerate(candidates)]
    results = _get_ranker().rerank(RerankRequest(query=query, passages=passages))

    ranked = [(candidates[result["id"]][0], float(result["score"])) for result in results]
    return ranked[:limit] if limit is not None else ranked
