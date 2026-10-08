"""Checklist evaluation: does the must-ask checklist answer what a document states, with evidence
from the right clause, and say "not mentioned" for what it doesn't state?

Runs the real pipeline, Gemini plus the quote and number checks, over a loan note and a lease
built from the messy fixture in checklist_fixture.py, then writes a dated markdown report to
evals/results/. Each document is run three times, because a model that gives a different answer
on a rerun is not one to trust. Six Gemini calls in all.

It also records what the model said before our checks ran, so a miss can be told apart: the model
not finding an answer, or our checks rejecting one it found correctly.

Needs Postgres running and a real GEMINI_API_KEY in api/.env. Run from the repo root:

    cd api && PYTHONPATH=. python ../evals/checklist_eval.py
"""

import asyncio
import datetime
import os
import time
from dataclasses import dataclass

from checklist_fixture import DOCUMENTS, Expect
from eval_common import build_document, percent
from google.genai import errors as genai_errors
from retrieval_eval import RESULTS_DIR, delete_document

import app.checklist as checklist_module
from app.checklist import ChecklistAnswer, ChecklistResponse, answer_checklist
from app.checklist_questions import questions_for
from app.db import async_session

# Free-tier quotas are counted per model, so the model under test can be swapped with
# CHECKLIST_EVAL_MODEL. Left unset it measures whatever the app itself uses.
MODEL = os.environ.get("CHECKLIST_EVAL_MODEL", checklist_module.CHECKLIST_MODEL)
checklist_module.CHECKLIST_MODEL = MODEL

REPEATS = 3

# The free Gemini tier caps requests per minute, so a rate-limit error is retried patiently here
# instead of failing the whole run. Production code does not retry.
MAX_ATTEMPTS = 4
RETRY_DELAY_SECONDS = 20

CORRECT = "correct"
NOT_MENTIONED_OK = "correctly not mentioned"
INVENTED = "invented an answer"
WRONG_CLAUSE = "wrong clause"
WRONG_VALUE = "wrong answer"
DROPPED = "dropped by our checks"
MISSED = "model said not mentioned"


@dataclass
class QuestionOutcome:
    doc_type: str
    run: int
    question_id: str
    present: bool  # the document really does answer this question
    label: str
    answer: str | None
    evidence_count: int
    quotes: list[str]
    gap: bool


def classify(
    expected: Expect | None,
    item: ChecklistAnswer,
    raw_found: bool,
    clause_key_by_id: dict[str, str],
) -> str:
    answered = item.status == "answered"
    if expected is None:
        return INVENTED if answered else NOT_MENTIONED_OK
    if not answered:
        return DROPPED if raw_found else MISSED

    cited = {clause_key_by_id[e.clause_id] for e in item.evidence}
    if not cited & set(expected.clauses):
        return WRONG_CLAUSE

    text = (item.answer or "").lower()
    has_any = not expected.any_words or any(word in text for word in expected.any_words)
    has_all = all(word in text for word in expected.all_words)
    return CORRECT if has_any and has_all else WRONG_VALUE


def _with_retries(call):
    """Retries a model call patiently on a rate limit, and stops the run on a daily quota."""

    def wrapped(*args):
        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                return call(*args)
            except genai_errors.APIError as error:
                if "PerDay" in str(error):
                    raise SystemExit(
                        f"Daily request quota exhausted for {MODEL}. Waiting won't help: rerun "
                        "tomorrow, set CHECKLIST_EVAL_MODEL to a different model, or enable billing."
                    ) from error
                if attempt == MAX_ATTEMPTS:
                    raise
                time.sleep(RETRY_DELAY_SECONDS)
        raise AssertionError("unreachable")

    return wrapped


def install_recording_model() -> list[ChecklistResponse]:
    """Wraps both real model calls with rate-limit retries, and keeps each raw answer response
    so a miss can be told apart from our own checks rejecting a correct answer."""
    real_generate = _with_retries(checklist_module.generate_checklist)
    raw_responses: list[ChecklistResponse] = []

    def recording_generate(questions, clauses, seed=None):
        response = real_generate(questions, clauses, seed)
        raw_responses.append(response)
        return response

    checklist_module.generate_checklist = recording_generate
    checklist_module.judge_answers = _with_retries(checklist_module.judge_answers)
    return raw_responses


def render_report(outcomes: list[QuestionOutcome], seconds: list[float]) -> str:
    today = datetime.date.today().isoformat()
    present = [o for o in outcomes if o.present]
    absent = [o for o in outcomes if not o.present]

    def count(items: list[QuestionOutcome], label: str) -> int:
        return sum(1 for o in items if o.label == label)

    # An important question the document does not answer must come back flagged as a gap.
    absent_important = []
    for doc_type in DOCUMENTS:
        important = {q.id for q in questions_for(doc_type) if q.importance == "high"}
        absent_important += [o for o in absent if o.doc_type == doc_type and o.question_id in important]
    flagged = sum(1 for o in absent_important if o.gap)

    # How often a multi-part answer used more than one quote, the case this design exists for.
    fee_runs = [o for o in outcomes if o.question_id == "nonrefundable_fees" and o.label == CORRECT]
    multi_quote = sum(1 for o in fee_runs if o.evidence_count >= 2)

    unstable = []
    for doc_type in DOCUMENTS:
        for question_id in {o.question_id for o in outcomes if o.doc_type == doc_type}:
            labels = {
                o.label for o in outcomes if o.doc_type == doc_type and o.question_id == question_id
            }
            if len(labels) > 1:
                unstable.append(f"{doc_type}.{question_id}: {sorted(labels)}")

    scored = len(present) // REPEATS + len(absent) // REPEATS
    lines = [
        f"# Must-ask checklist evaluation, {today}",
        "",
        f"Model under test: `{MODEL}`.",
        "",
        f"A loan note (11 clauses) and a lease (12 clauses) written the way real contracts come out "
        f"of a PDF, with digit numbers, broken lines, a flattened fee table, and filler clauses, "
        f"each run {REPEATS} times with real Gemini and the real quote and number checks. Ground "
        "truth was written before any results were seen and not tuned afterward. About a third of "
        "the questions are not answered by the text on purpose, including important ones, so "
        "inventing an answer is a measurable failure. Each document also has a decoy clause that "
        "mentions a topic without answering it, added after a real lease showed the model treating "
        "a passing mention as an answer.",
        "",
        f"## Questions the document answers ({len(present)} question-runs)",
        "",
        "| Outcome | Count |",
        "|---|---|",
        f"| Right clause and right answer | {percent(count(present, CORRECT), len(present))} |",
        f"| Cited a wrong clause | {percent(count(present, WRONG_CLAUSE), len(present))} |",
        f"| Right clause, wrong answer | {percent(count(present, WRONG_VALUE), len(present))} |",
        f"| Model said not mentioned | {percent(count(present, MISSED), len(present))} |",
        f"| Found, then dropped by our checks | {percent(count(present, DROPPED), len(present))} |",
        "",
        "The last row is the cost of our safety checks: the model found the answer but its quote or "
        "a number in it did not verify, so a reader sees \"not mentioned\" instead.",
        "",
        f"## Questions the document does not answer ({len(absent)} question-runs)",
        "",
        "| Outcome | Count |",
        "|---|---|",
        f"| Correctly said not mentioned | {percent(count(absent, NOT_MENTIONED_OK), len(absent))} |",
        f"| Invented an answer | {percent(count(absent, INVENTED), len(absent))} |",
        "",
        "## Gaps and the multi-part answer",
        "",
        f"- Important questions the document does not answer, flagged as a gap: "
        f"{percent(flagged, len(absent_important))}.",
        f"- The fee question needs two separate quotes. Of the runs that got it right, "
        f"{percent(multi_quote, len(fee_runs))} used more than one quote.",
        "",
        "## Stability across the repeated runs",
        "",
        "Questions whose outcome changed between runs of the same document: "
        f"{len(unstable)}.",
        *[f"- {item}" for item in sorted(unstable)],
        "",
        "## Latency",
        "",
        f"Mean {sum(seconds) / len(seconds):.1f}s per document, slowest {max(seconds):.1f}s.",
        "",
        "## Every miss",
        "",
    ]

    misses = [o for o in outcomes if o.label not in (CORRECT, NOT_MENTIONED_OK)]
    if not misses:
        lines.append("None.")
    for o in misses:
        lines.append(f"- [{o.label}] {o.doc_type}.{o.question_id} (run {o.run})")
        if o.answer:
            lines.append(f"  - answer: {o.answer!r}")
        for quote in o.quotes:
            lines.append(f"  - quote: {quote!r}")

    lines += [
        "",
        "## Caveats",
        "",
        f"- Two documents of 11 and 12 clauses and {scored} scored questions is a small sample, one or two "
        "questions is not strong evidence.",
        "- The documents are short and written by me. Real contracts are longer, messier, and "
        "scanned, and I have not run this on one yet.",
        "- The second check is a model call too. On a real lease it wrongly withheld a correct "
        "answer about 1 time in 8 and once gave a different verdict on identical input, so a good "
        "answer can show as not mentioned. The \"dropped by our checks\" row measures that cost, "
        "and it was zero on this fixture, which is clean and not a promise about real contracts.",
        "- The free Gemini tier allows 15 requests a minute, and the checklist now makes two calls "
        "per document, so the slowest runs here include waiting on that limit.",
        "- Whether an answer is right is judged by words it must contain, not by reading it, so a "
        "correct answer phrased unexpectedly would count as wrong, and a sloppy one that happens "
        "to contain the words would count as right.",
        "",
    ]
    return "\n".join(lines)


async def main() -> None:
    raw_responses = install_recording_model()
    outcomes: list[QuestionOutcome] = []
    seconds: list[float] = []

    async with async_session() as session:
        for doc_type, spec in DOCUMENTS.items():
            document, user, clause_key_by_id = await build_document(
                session, doc_type, spec["clauses"], "checklist"
            )
            try:
                for run in range(1, REPEATS + 1):
                    raw_responses.clear()
                    started = time.monotonic()
                    result = await answer_checklist(session, document.id, doc_type)
                    seconds.append(time.monotonic() - started)

                    # Each run reads the document once per seed. The raw model "found" an answer
                    # when most of those raw reads did, before our checks ran.
                    votes: dict[str, int] = {}
                    for raw in raw_responses:
                        seen_ids: set[str] = set()
                        for entry in raw.answers:
                            if entry.id not in seen_ids:
                                seen_ids.add(entry.id)
                                votes[entry.id] = votes.get(entry.id, 0) + int(entry.found)
                    raw_found = {name: n * 2 > len(raw_responses) for name, n in votes.items()}

                    for item in result.answers:
                        expected = spec["expected"][item.id]
                        label = classify(
                            expected, item, raw_found.get(item.id, False), clause_key_by_id
                        )
                        outcomes.append(
                            QuestionOutcome(
                                doc_type,
                                run,
                                item.id,
                                expected is not None,
                                label,
                                item.answer,
                                len(item.evidence),
                                [e.quote for e in item.evidence],
                                item.gap,
                            )
                        )
                        print(f"  {label:26} {doc_type}.{item.id} (run {run})", flush=True)
            finally:
                await delete_document(session, document, user)

    report = render_report(outcomes, seconds)
    print("\n" + report)
    RESULTS_DIR.mkdir(exist_ok=True)
    (RESULTS_DIR / f"checklist-{datetime.date.today().isoformat()}.md").write_text(report)


if __name__ == "__main__":
    asyncio.run(main())
