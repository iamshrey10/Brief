"""Key-terms evaluation: does extraction find the facts a document states, point at the right
clause, and say "not mentioned" for the ones it doesn't state?

Runs the real pipeline, Gemini plus the quote and number checks, over a loan document and a
lease document built from the fixture in key_terms_fixture.py, then writes a dated markdown
report to evals/results/. Each document is extracted three times, because a model that gives
a different answer on a rerun is not one to trust. Six Gemini calls in all.

It also records what the model said before our checks ran, so a miss can be told apart: the
model not finding a term, or our checks rejecting a term it found correctly.

Needs Postgres running and a real GEMINI_API_KEY in api/.env. Run from the repo root:

    cd api && PYTHONPATH=. python ../evals/key_terms_eval.py
"""

import asyncio
import datetime
import os
import time
from dataclasses import dataclass

from google.genai import errors as genai_errors
from eval_common import build_document, percent
from key_terms_fixture import DOCUMENTS
from retrieval_eval import RESULTS_DIR, delete_document

import app.key_terms as key_terms_module
from app.db import async_session
from app.key_term_fields import fields_for
from app.key_terms import ExtractionResponse, KeyTerm, extract_key_terms

# Free-tier quotas are counted per model, so the model under test can be swapped with
# KEY_TERMS_EVAL_MODEL. Left unset it measures whatever the app itself uses.
MODEL = os.environ.get("KEY_TERMS_EVAL_MODEL", key_terms_module.KEY_TERMS_MODEL)
key_terms_module.KEY_TERMS_MODEL = MODEL

REPEATS = 3

# The free Gemini tier caps requests per minute, so a rate-limit error is retried patiently
# here instead of failing the whole run. Production code does not retry.
MAX_ATTEMPTS = 4
RETRY_DELAY_SECONDS = 20

CORRECT = "correct"
NOT_MENTIONED_OK = "correctly not mentioned"
INVENTED = "invented a value"
WRONG_CLAUSE = "wrong clause"
WRONG_VALUE = "wrong value"
DROPPED = "dropped by our checks"
MISSED = "model said not mentioned"


@dataclass
class FieldOutcome:
    doc_type: str
    run: int
    field: str
    present: bool  # the document really does state this field
    label: str
    value: str | None
    quote: str | None


def classify(expected, term: KeyTerm, raw_found: bool, clause_key_by_id: dict[str, str]) -> str:
    if expected is None:
        return INVENTED if term.found else NOT_MENTIONED_OK
    clause_key, accepted_words = expected
    if not term.found:
        return DROPPED if raw_found else MISSED
    if clause_key_by_id.get(term.clause_id) != clause_key:
        return WRONG_CLAUSE
    if accepted_words and not any(word in (term.value or "").lower() for word in accepted_words):
        return WRONG_VALUE
    return CORRECT


def install_recording_model() -> list[ExtractionResponse]:
    """Wraps the real model call so each raw response is kept, with rate-limit retries."""
    real_generate = key_terms_module.generate_key_terms
    raw_responses: list[ExtractionResponse] = []

    def recording_generate(fields, clauses):
        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                response = real_generate(fields, clauses)
                raw_responses.append(response)
                return response
            except genai_errors.APIError as error:
                if "PerDay" in str(error):
                    raise SystemExit(
                        f"Daily request quota exhausted for {MODEL}. Waiting won't help: rerun "
                        "tomorrow, set KEY_TERMS_EVAL_MODEL to a different model, or enable billing."
                    ) from error
                if attempt == MAX_ATTEMPTS:
                    raise
                time.sleep(RETRY_DELAY_SECONDS)
        raise AssertionError("unreachable")

    key_terms_module.generate_key_terms = recording_generate
    return raw_responses


def render_report(outcomes: list[FieldOutcome], seconds: list[float]) -> str:
    today = datetime.date.today().isoformat()
    present = [o for o in outcomes if o.present]
    absent = [o for o in outcomes if not o.present]

    def count(items: list[FieldOutcome], label: str) -> int:
        return sum(1 for o in items if o.label == label)

    # A field whose outcome changed between the repeated runs of the same document.
    unstable = []
    for doc_type in DOCUMENTS:
        for field in {o.field for o in outcomes if o.doc_type == doc_type}:
            labels = {o.label for o in outcomes if o.doc_type == doc_type and o.field == field}
            if len(labels) > 1:
                unstable.append(f"{doc_type}.{field}: {sorted(labels)}")

    lines = [
        f"# Key-terms evaluation, {today}",
        "",
        f"Model under test: `{MODEL}`.",
        "",
        f"A loan document (9 clauses) and a lease document (8 clauses) built from the "
        f"retrieval fixture, each extracted {REPEATS} times with real Gemini and the real quote "
        "and number checks. Ground truth was written before any results were seen and not "
        "tuned afterward. Most fields are not stated in the fixture on purpose, so inventing a "
        "value is a measurable failure.",
        "",
        f"## Terms the document states ({len(present)} field-runs)",
        "",
        "| Outcome | Count |",
        "|---|---|",
        f"| Right clause and right value | {percent(count(present, CORRECT), len(present))} |",
        f"| Cited a wrong clause | {percent(count(present, WRONG_CLAUSE), len(present))} |",
        f"| Right clause, wrong value | {percent(count(present, WRONG_VALUE), len(present))} |",
        f"| Model said not mentioned | {percent(count(present, MISSED), len(present))} |",
        f"| Found, then dropped by our checks | {percent(count(present, DROPPED), len(present))} |",
        "",
        "The last row is the cost of our safety checks: the model found the term but its quote "
        "or a number in its value did not verify, so a reader sees \"not mentioned\" instead.",
        "",
        f"## Terms the document does not state ({len(absent)} field-runs)",
        "",
        "| Outcome | Count |",
        "|---|---|",
        f"| Correctly said not mentioned | {percent(count(absent, NOT_MENTIONED_OK), len(absent))} |",
        f"| Invented a value | {percent(count(absent, INVENTED), len(absent))} |",
        "",
        "## Stability across the repeated runs",
        "",
        "Fields whose outcome changed between runs of the same document: "
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
        lines.append(f"- [{o.label}] {o.doc_type}.{o.field} (run {o.run})")
        if o.value:
            lines.append(f"  - value: {o.value!r}")
        if o.quote:
            lines.append(f"  - quote: {o.quote!r}")

    ambiguous = {t: sorted(d["ambiguous"]) for t, d in DOCUMENTS.items()}
    lines += [
        "",
        "## Caveats",
        "",
        f"- Two documents of 8 to 9 clauses and {len(present) // REPEATS + len(absent) // REPEATS} "
        "scored fields is a small sample, one or two fields is not strong evidence.",
        f"- Fields left out of scoring because the fixture text is ambiguous for them: {ambiguous}.",
        "- The fixture states its numbers in words (\"six point eight percent\") and the model "
        "copied them as words, so our digit-by-digit number check was never exercised by this "
        "run. A perfect score here is not evidence the check, or the extraction, is flawless.",
        "- Clean, short clauses. Real contracts are longer, messier, and scanned.",
        "",
    ]
    return "\n".join(lines)


async def main() -> None:
    raw_responses = install_recording_model()
    outcomes: list[FieldOutcome] = []
    seconds: list[float] = []

    async with async_session() as session:
        for doc_type, spec in DOCUMENTS.items():
            document, user, clause_key_by_id = await build_document(
                session, doc_type, spec["clauses"], "key-terms"
            )
            try:
                for run in range(1, REPEATS + 1):
                    raw_responses.clear()
                    started = time.monotonic()
                    result = await extract_key_terms(session, document.id, doc_type)
                    seconds.append(time.monotonic() - started)

                    raw_found = {}
                    for entry in raw_responses[-1].fields:
                        raw_found.setdefault(entry.name, entry.found)

                    for field in fields_for(doc_type):
                        if field.name in spec["ambiguous"]:
                            continue
                        term = next(t for t in result.terms if t.name == field.name)
                        expected = spec["expected"][field.name]
                        label = classify(
                            expected, term, raw_found.get(field.name, False), clause_key_by_id
                        )
                        outcomes.append(
                            FieldOutcome(
                                doc_type,
                                run,
                                field.name,
                                expected is not None,
                                label,
                                term.value,
                                term.quote,
                            )
                        )
                        print(f"  {label:26} {doc_type}.{field.name} (run {run})", flush=True)
            finally:
                await delete_document(session, document, user)

    report = render_report(outcomes, seconds)
    print("\n" + report)
    RESULTS_DIR.mkdir(exist_ok=True)
    (RESULTS_DIR / f"key-terms-{datetime.date.today().isoformat()}.md").write_text(report)


if __name__ == "__main__":
    asyncio.run(main())
