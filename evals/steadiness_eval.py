"""Steadiness evaluation: does reading the same real document again give the same result?

The key terms and the must-ask questions come from a model, and the same document read twice used to
come out differently. This reads one real, already-read document several times two ways and counts how
many fields changed between runs:

- one unseeded read per run (how it worked before the votes), and
- the voted read the app uses now (three seeded reads, and for the questions each answer judged alone).

Nothing is saved to the database. The report holds only field and question ids and counts, never a
value, a quote, or a file name, because the document is a real private one and the report is committed.
Steadier is not the same as more accurate, and one document is not a general result.

Needs Postgres running, a real GEMINI_API_KEY in api/.env, and the id of a document that is Ready.
Run from the repo root:

    cd api && PYTHONPATH=. python ../evals/steadiness_eval.py <document-id> <loan|lease|offer|other> <runs> <label>
"""

import asyncio
import datetime
import sys
import time
import uuid

from google.genai import errors as genai_errors
from retrieval_eval import RESULTS_DIR

import app.checklist as checklist_module
import app.key_terms as key_terms_module
from app.checklist_questions import questions_for
from app.db import async_session
from app.document_text import load_prompt_clauses
from app.key_term_fields import fields_for

# The free Gemini tier caps requests a minute, so a rate-limit error is waited out here. The app
# does not do this for generation, so a real person on the free tier could see those errors.
MAX_ATTEMPTS = 6
RETRY_DELAY_SECONDS = 25
PAUSE_BETWEEN_RUNS_SECONDS = 8


def patient(call):
    def wrapped(*args, **kwargs):
        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                return call(*args, **kwargs)
            except genai_errors.APIError as error:
                if "PerDay" in str(error):
                    raise SystemExit("Daily request quota exhausted, rerun tomorrow or enable billing.") from error
                if attempt == MAX_ATTEMPTS:
                    raise
                time.sleep(RETRY_DELAY_SECONDS)

    return wrapped


def key_term_outcome(terms) -> dict[str, str | None]:
    """What a reader would see per field, as a comparable string (None when not mentioned)."""
    return {t.name: (t.value or "").strip().lower() if t.found else None for t in terms}


def checklist_outcome(answers) -> dict[str, str | None]:
    return {a.id: "answered" if a.status == "answered" else None for a in answers}


def changed(outcomes: list[dict[str, str | None]]) -> list[str]:
    """The ids whose result differed between any two runs."""
    return sorted(name for name in outcomes[0] if len({str(run[name]) for run in outcomes}) > 1)


def found_counts(outcomes: list[dict[str, str | None]]) -> list[int]:
    return [sum(1 for value in run.values() if value) for run in outcomes]


async def measure(document_id: uuid.UUID, doc_type: str, runs: int) -> dict[str, list[dict[str, str | None]]]:
    key_terms_module.generate_key_terms = patient(key_terms_module.generate_key_terms)
    checklist_module.generate_checklist = patient(checklist_module.generate_checklist)
    checklist_module.judge_answers = patient(checklist_module.judge_answers)
    fields, questions = fields_for(doc_type), questions_for(doc_type)
    results: dict[str, list[dict[str, str | None]]] = {
        "key terms, one unseeded read": [],
        "key terms, voted": [],
        "questions, one unseeded read": [],
        "questions, voted": [],
    }

    async with async_session() as session:
        loaded = await load_prompt_clauses(session, document_id)
        if not loaded.sent:
            raise SystemExit("That document has no text to read, is it Ready?")

        for run in range(1, runs + 1):
            print(f"run {run} of {runs}", flush=True)
            response = key_terms_module.generate_key_terms(fields, loaded.labeled)
            results["key terms, one unseeded read"].append(
                key_term_outcome(key_terms_module.verify_terms(fields, response, loaded.by_label))
            )
            time.sleep(PAUSE_BETWEEN_RUNS_SECONDS)

            voted = await key_terms_module.extract_key_terms(session, document_id, doc_type)
            results["key terms, voted"].append(key_term_outcome(voted.terms))
            time.sleep(PAUSE_BETWEEN_RUNS_SECONDS)

            response = checklist_module.generate_checklist(questions, loaded.labeled)
            verified = checklist_module.verify_answers(questions, response, loaded.by_label)
            to_judge = [(q, a) for q, a in zip(questions, verified, strict=True) if a.status == "answered"]
            confirmed = checklist_module.judge_answers(to_judge) if to_judge else set()
            verified = [
                checklist_module._not_mentioned(q) if a.status == "answered" and a.id not in confirmed else a
                for q, a in zip(questions, verified, strict=True)
            ]
            results["questions, one unseeded read"].append(checklist_outcome(verified))
            time.sleep(PAUSE_BETWEEN_RUNS_SECONDS)

            voted_answers = await checklist_module.answer_checklist(session, document_id, doc_type)
            results["questions, voted"].append(checklist_outcome(voted_answers.answers))
            time.sleep(PAUSE_BETWEEN_RUNS_SECONDS)
    return results


def render_report(label: str, doc_type: str, runs: int, clause_count: int, results) -> str:
    lines = [
        f"# Steadiness evaluation, {datetime.date.today().isoformat()}, {label}",
        "",
        f"One real, already read {doc_type} document of {clause_count} pieces, read {runs} times each way "
        "with the real model and the real quote and number checks. Nothing was saved. Only field and question "
        "ids and counts are recorded here, never values or quotes, because the document is private.",
        "",
        "| Way of reading | Found per run | Ids that changed between runs |",
        "|---|---|---|",
    ]
    for name, outcomes in results.items():
        flips = changed(outcomes)
        lines.append(f"| {name} | {found_counts(outcomes)} | {len(flips)}{': ' + ', '.join(flips) if flips else ''} |")
    lines += [
        "",
        "## Caveats",
        "",
        "- One document and a handful of runs. Fewer changes means steadier, not more accurate: a mistake the "
        "model makes in most runs is still a mistake, and I have not read this document to say which "
        "answers are right.",
        "- The voted reads make about ten model calls per document and were slower, see the README.",
        "",
    ]
    return "\n".join(lines)


async def main() -> None:
    if len(sys.argv) != 5:
        raise SystemExit(__doc__)
    document_id, doc_type, runs, label = uuid.UUID(sys.argv[1]), sys.argv[2], int(sys.argv[3]), sys.argv[4]
    results = await measure(document_id, doc_type, runs)
    async with async_session() as session:
        clause_count = len((await load_prompt_clauses(session, document_id)).labeled)
    report = render_report(label, doc_type, runs, clause_count, results)
    print("\n" + report)
    RESULTS_DIR.mkdir(exist_ok=True)
    (RESULTS_DIR / f"steadiness-{datetime.date.today().isoformat()}-{label}.md").write_text(report)


if __name__ == "__main__":
    asyncio.run(main())
