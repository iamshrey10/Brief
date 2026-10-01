"""Retrieval evaluation: how often does each search strategy put the right clause first?

Runs every question in retrieval_fixture.py against a temporary document built with real
Gemini embeddings, scores each strategy, prints the result and writes a markdown report
to evals/results/. The temporary document and user are deleted afterward.

Needs Postgres running and a real GEMINI_API_KEY in api/.env. Run from the repo root:

    cd api && PYTHONPATH=. python ../evals/retrieval_eval.py
"""

import asyncio
import datetime
from collections.abc import Awaitable, Callable
from pathlib import Path

from retrieval_fixture import CLAUSES, QUESTIONS
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import app.reranker as reranker_module
import app.retrieval as retrieval_module
from app.db import async_session
from app.ingestion import embed_texts
from app.models import Clause, Document, Embedding, User
from app.retrieval import hybrid_search, keyword_search, reranked_search, vector_search

EVAL_EMAIL = "retrieval-eval@brief.local"
TOP_N = 10
TINY_MODEL = "ms-marco-TinyBERT-L-2-v2"
RESULTS_DIR = Path(__file__).parent / "results"

_query_embeddings: dict[str, list[float]] = {}


def cached_embed_query(query: str) -> list[float]:
    """Each question is embedded once and reused across every strategy that needs it."""
    if query not in _query_embeddings:
        _query_embeddings[query] = embed_texts([query])[0]
    return _query_embeddings[query]


retrieval_module.embed_query = cached_embed_query

Strategy = Callable[[AsyncSession, object, str], Awaitable[list]]


async def run_keyword(session: AsyncSession, document_id, question: str) -> list:
    return [cid for cid, _rank in await keyword_search(session, document_id, question, limit=TOP_N)]


async def run_vector(session: AsyncSession, document_id, question: str) -> list:
    results = await vector_search(session, document_id, cached_embed_query(question), limit=TOP_N)
    return [cid for cid, _distance in results]


async def run_hybrid(session: AsyncSession, document_id, question: str) -> list:
    return [c.id for c in await hybrid_search(session, document_id, question, limit=TOP_N)]


async def run_reranked(session: AsyncSession, document_id, question: str) -> list:
    return [c.id for c in await reranked_search(session, document_id, question, limit=TOP_N)]


async def run_reranked_tiny(session: AsyncSession, document_id, question: str) -> list:
    original = reranker_module.RERANK_MODEL
    reranker_module.RERANK_MODEL = TINY_MODEL
    reranker_module._get_ranker.cache_clear()
    try:
        return await run_reranked(session, document_id, question)
    finally:
        reranker_module.RERANK_MODEL = original
        reranker_module._get_ranker.cache_clear()


STRATEGIES: dict[str, Strategy] = {
    "keyword only": run_keyword,
    "vector only": run_vector,
    "hybrid (keyword + vector)": run_hybrid,
    "hybrid + rerank (TinyBERT)": run_reranked_tiny,
    "hybrid + rerank (MiniLM)": run_reranked,
}
FINAL_PIPELINE = "hybrid + rerank (MiniLM)"


def rank_of(expected_id, ranked_ids: list) -> int | None:
    return ranked_ids.index(expected_id) + 1 if expected_id in ranked_ids else None


def summarize(ranks: list[int | None]) -> tuple[float, float, float]:
    total = len(ranks)
    hit1 = sum(1 for r in ranks if r == 1) / total
    hit3 = sum(1 for r in ranks if r is not None and r <= 3) / total
    mrr = sum(1 / r for r in ranks if r is not None) / total
    return hit1, hit3, mrr


async def build_document(session: AsyncSession) -> tuple[Document, User, dict]:
    user = (await session.execute(select(User).where(User.email == EVAL_EMAIL))).scalar_one_or_none()
    if user is None:
        user = User(email=EVAL_EMAIL)
        session.add(user)
        await session.flush()

    document = Document(
        user_id=user.id,
        filename="retrieval-eval.pdf",
        doc_type="other",
        status="ready",
        storage_key="eval/retrieval.pdf",
        file_size_bytes=0,
        content_type="application/pdf",
    )
    session.add(document)
    await session.flush()

    keys = list(CLAUSES)
    vectors = embed_texts([CLAUSES[key] for key in keys])
    key_to_id = {}
    for index, (key, vector) in enumerate(zip(keys, vectors, strict=True)):
        clause = Clause(
            document_id=document.id,
            clause_index=index,
            page_number=1,
            char_start=0,
            char_end=len(CLAUSES[key]),
            text=CLAUSES[key],
        )
        session.add(clause)
        await session.flush()
        session.add(Embedding(clause_id=clause.id, vector=vector))
        key_to_id[key] = clause.id

    await session.commit()
    return document, user, key_to_id


def render_report(overall, by_difficulty, misses) -> str:
    today = datetime.date.today().isoformat()
    lines = [
        f"# Retrieval evaluation, {today}",
        "",
        f"{len(QUESTIONS)} questions over a {len(CLAUSES)}-clause mixed loan and lease fixture, "
        "real Gemini embeddings, real Postgres. Fixture and questions were written before "
        "any results were seen and not tuned afterward.",
        "",
        "## Overall",
        "",
        "| Strategy | hit@1 | hit@3 | MRR |",
        "|---|---|---|---|",
    ]
    for name, (hit1, hit3, mrr) in overall.items():
        lines.append(f"| {name} | {hit1:.0%} | {hit3:.0%} | {mrr:.2f} |")

    lines += ["", "## hit@1 by question difficulty", ""]
    difficulties = ["lexical", "paraphrase", "hard"]
    lines += [
        "| Strategy | " + " | ".join(difficulties) + " |",
        "|---|" + "---|" * len(difficulties),
    ]
    for name, scores in by_difficulty.items():
        lines.append(f"| {name} | " + " | ".join(f"{scores[d]:.0%}" for d in difficulties) + " |")

    lines += ["", f"## Questions the final pipeline ({FINAL_PIPELINE}) got wrong at rank 1", ""]
    if not misses:
        lines.append("None.")
    for question, expected, returned in misses:
        lines.append(f"- {question!r} expected `{expected}`, put `{returned}` first")

    lines += [
        "",
        "## Caveats",
        "",
        "- The fixture has 17 clauses, so the rerank shortlist covers the whole document. "
        "On a real 100-page agreement the shortlist step matters and this fixture cannot "
        "show it.",
        f"- {len(QUESTIONS)} questions is a small sample, differences of a question or two "
        "are not strong evidence.",
        "",
    ]
    return "\n".join(lines)


async def main() -> None:
    async with async_session() as session:
        document, user, key_to_id = await build_document(session)
        id_to_key = {clause_id: key for key, clause_id in key_to_id.items()}

        try:
            all_ranks: dict[str, list[int | None]] = {name: [] for name in STRATEGIES}
            by_difficulty_ranks: dict[str, dict[str, list[int | None]]] = {
                name: {"lexical": [], "paraphrase": [], "hard": []} for name in STRATEGIES
            }
            misses = []

            for question, expected_key, difficulty in QUESTIONS:
                expected_id = key_to_id[expected_key]
                for name, strategy in STRATEGIES.items():
                    ranked_ids = await strategy(session, document.id, question)
                    rank = rank_of(expected_id, ranked_ids)
                    all_ranks[name].append(rank)
                    by_difficulty_ranks[name][difficulty].append(rank)
                    if name == FINAL_PIPELINE and rank != 1:
                        first = id_to_key[ranked_ids[0]] if ranked_ids else "(nothing returned)"
                        misses.append((question, expected_key, first))

            overall = {name: summarize(ranks) for name, ranks in all_ranks.items()}
            by_difficulty = {
                name: {d: summarize(ranks)[0] for d, ranks in per_d.items()}
                for name, per_d in by_difficulty_ranks.items()
            }

            report = render_report(overall, by_difficulty, misses)
            print(report)
            RESULTS_DIR.mkdir(exist_ok=True)
            (RESULTS_DIR / f"retrieval-{datetime.date.today().isoformat()}.md").write_text(report)
        finally:
            await session.delete(document)
            await session.flush()
            still_owns = await session.execute(select(Document.id).where(Document.user_id == user.id))
            if still_owns.first() is None:
                await session.delete(user)
            await session.commit()


if __name__ == "__main__":
    asyncio.run(main())
