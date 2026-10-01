"""Grounded Q&A evaluation: does the full pipeline cite the right clause, and does it say
"I couldn't find this" when the document genuinely doesn't cover a question?

Runs the real pipeline, retrieval, Gemini, and the citation check, over the questions in
qa_fixture.py against a temporary document, then writes a dated markdown report to
evals/results/. Makes one Gemini call per question, so it takes several minutes.

Needs Postgres running and a real GEMINI_API_KEY in api/.env. Run from the repo root:

    cd api && PYTHONPATH=. python ../evals/qa_eval.py
"""

import asyncio
import datetime
import os
import time
from dataclasses import dataclass

from google.genai import errors as genai_errors
from qa_fixture import ANSWERABLE, UNANSWERABLE

# Importing retrieval_eval also installs its cached query embedder, so each question is
# embedded once even though the pipeline asks for it.
from retrieval_eval import RESULTS_DIR, build_document, delete_document
from sqlalchemy.ext.asyncio import AsyncSession

import app.qa as qa_module
from app.db import async_session
from app.qa import NOT_FOUND_ANSWER, UNVERIFIED_ANSWER, AnswerResult, answer_question

# Free-tier quotas are counted per model, so the model under test can be swapped with
# QA_EVAL_MODEL. Left unset it measures whatever the app itself uses.
MODEL = os.environ.get("QA_EVAL_MODEL", qa_module.ANSWER_MODEL)
qa_module.ANSWER_MODEL = MODEL

# The free Gemini tier caps requests per minute, so a rate-limit error is retried
# patiently here instead of failing the whole run. Production code does not retry.
MAX_ATTEMPTS = 4
RETRY_DELAY_SECONDS = 20


@dataclass
class Outcome:
    question: str
    kind: str  # "answerable" or "unanswerable"
    difficulty: str
    expected_key: str | None
    result: AnswerResult
    cited_keys: list[str]
    seconds: float
    label: str


async def ask_with_retry(session: AsyncSession, document_id, question: str) -> AnswerResult:
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            return await answer_question(session, document_id, question)
        except genai_errors.APIError as error:
            if "PerDay" in str(error):
                raise SystemExit(
                    f"Daily request quota exhausted for {MODEL}. Waiting won't help: rerun "
                    "tomorrow, set QA_EVAL_MODEL to a different model, or enable billing."
                ) from error
            if attempt == MAX_ATTEMPTS:
                raise
            await asyncio.sleep(RETRY_DELAY_SECONDS)
    raise AssertionError("unreachable")


def classify_answerable(result: AnswerResult, expected_key: str, cited_keys: list[str]) -> str:
    if not result.found:
        return "wrongly abstained"
    return "correct" if expected_key in cited_keys else "cited the wrong clause"


def classify_unanswerable(result: AnswerResult) -> str:
    return "hallucinated an answer" if result.found else "correctly abstained"


def percent(part: int, total: int) -> str:
    return f"{part / total:.0%} ({part}/{total})" if total else "n/a"


def render_report(outcomes: list[Outcome]) -> str:
    today = datetime.date.today().isoformat()
    answerable = [o for o in outcomes if o.kind == "answerable"]
    unanswerable = [o for o in outcomes if o.kind == "unanswerable"]

    correct = [o for o in answerable if o.label == "correct"]
    wrong_clause = [o for o in answerable if o.label == "cited the wrong clause"]
    abstained = [o for o in answerable if o.label == "wrongly abstained"]
    verifier_rejected = [o for o in abstained if o.result.answer == UNVERIFIED_ANSWER]
    correct_abstain = [o for o in unanswerable if o.label == "correctly abstained"]
    mean_seconds = sum(o.seconds for o in outcomes) / len(outcomes)
    slowest = max(o.seconds for o in outcomes)

    lines = [
        f"# Grounded Q&A evaluation, {today}",
        "",
        f"Model under test: `{MODEL}`.",
        "",
        f"{len(answerable)} answerable and {len(unanswerable)} unanswerable questions over the "
        "17-clause mixed loan and lease fixture. Real Gemini, real Postgres, and the real "
        "citation check. Questions were written before any results were seen and not tuned "
        "afterward.",
        "",
        "## Answerable questions",
        "",
        "| Outcome | Count |",
        "|---|---|",
        f"| Cited the right clause | {percent(len(correct), len(answerable))} |",
        f"| Cited a wrong clause | {percent(len(wrong_clause), len(answerable))} |",
        f"| Wrongly abstained | {percent(len(abstained), len(answerable))} |",
        "",
        f"Of the wrong abstentions, {len(verifier_rejected)} were our citation check rejecting "
        "the model's quote, the rest were the model itself saying the document didn't cover it.",
        "",
        "## Unanswerable questions",
        "",
        "| Outcome | Count |",
        "|---|---|",
        f"| Correctly said it couldn't find it | {percent(len(correct_abstain), len(unanswerable))} |",
        f"| Hallucinated an answer | {percent(len(unanswerable) - len(correct_abstain), len(unanswerable))} |",
        "",
        "## Latency",
        "",
        f"Mean {mean_seconds:.1f}s per question, slowest {slowest:.1f}s.",
        "",
        "## Every miss",
        "",
    ]

    misses = [
        o for o in outcomes if o.label not in ("correct", "correctly abstained")
    ]
    if not misses:
        lines.append("None.")
    for o in misses:
        detail = f"cited {o.cited_keys}" if o.cited_keys else "no citations"
        lines.append(f"- [{o.label}] {o.question!r}, expected {o.expected_key or 'an abstention'}, {detail}")
        if o.result.answer not in (NOT_FOUND_ANSWER, UNVERIFIED_ANSWER):
            lines.append(f"  - answered: {o.result.answer}")

    lines += [
        "",
        "## Caveats",
        "",
        f"- {len(outcomes)} questions is a small sample, a difference of one or two is not "
        "strong evidence.",
        "- The fixture is 17 short, clean clauses. Real contracts are longer and messier.",
        "- Clause identity is decided by exact clause text, so a clause that repeats another "
        "word for word could be credited to the wrong key.",
        "",
    ]
    return "\n".join(lines)


async def main() -> None:
    async with async_session() as session:
        document, user, key_to_id = await build_document(session)
        key_by_clause_id = {str(clause_id): key for key, clause_id in key_to_id.items()}

        try:
            outcomes: list[Outcome] = []
            work = [(q, "answerable", d, k) for q, k, d in ANSWERABLE] + [
                (q, "unanswerable", "n/a", None) for q in UNANSWERABLE
            ]

            for question, kind, difficulty, expected_key in work:
                started = time.monotonic()
                result = await ask_with_retry(session, document.id, question)
                seconds = time.monotonic() - started

                cited_keys = [key_by_clause_id[c.clause_id] for c in result.citations]
                if kind == "answerable":
                    label = classify_answerable(result, expected_key, cited_keys)
                else:
                    label = classify_unanswerable(result)
                outcomes.append(
                    Outcome(question, kind, difficulty, expected_key, result, cited_keys, seconds, label)
                )
                print(f"  {label:26} {question[:60]}", flush=True)

            report = render_report(outcomes)
            print("\n" + report)
            RESULTS_DIR.mkdir(exist_ok=True)
            (RESULTS_DIR / f"qa-{datetime.date.today().isoformat()}.md").write_text(report)
        finally:
            await delete_document(session, document, user)


if __name__ == "__main__":
    asyncio.run(main())
