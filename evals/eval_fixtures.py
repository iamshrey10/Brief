"""Which labeled document and questions an evaluation runs over. Plain data and no imports of the app, so a test
can read it without starting a model or a database."""

from dataclasses import dataclass

import loan_fixture
import offer_fixture
import qa_fixture
import retrieval_fixture


@dataclass(frozen=True)
class Fixture:
    name: str
    description: str  # for the report, such as "17-clause mixed loan and lease fixture"
    doc_type: str  # the kind of document the temporary document is made as
    clauses: dict[str, str]
    answerable: list[tuple[str, str, str]]
    unanswerable: list[str]
    report_prefix: str  # reports are written to results/<prefix>-<date>.md
    provenance: str  # how the questions were written, said in the report


FIXTURES: dict[str, Fixture] = {
    "loan-lease": Fixture(
        name="loan-lease",
        description="17-clause mixed loan and lease fixture",
        doc_type="other",
        clauses=retrieval_fixture.CLAUSES,
        answerable=qa_fixture.ANSWERABLE,
        unanswerable=qa_fixture.UNANSWERABLE,
        report_prefix="qa",
        provenance=(
            "Questions were written before any results were seen and not tuned afterward, except one near "
            "miss question replaced on October 17 after it proved ambiguous, which the note at the top of "
            "qa_fixture.py describes."
        ),
    ),
    "offer": Fixture(
        name="offer",
        description="17-clause job offer fixture",
        doc_type="offer",
        clauses=offer_fixture.CLAUSES,
        answerable=offer_fixture.ANSWERABLE,
        unanswerable=offer_fixture.UNANSWERABLE,
        report_prefix="qa-offer",
        provenance=(
            "Questions were written before any results were seen and not tuned afterward, as the note at "
            "the top of offer_fixture.py describes."
        ),
    ),
    "loan": Fixture(
        name="loan",
        description="17-clause education loan fixture",
        doc_type="loan",
        clauses=loan_fixture.CLAUSES,
        answerable=loan_fixture.ANSWERABLE,
        unanswerable=loan_fixture.UNANSWERABLE,
        report_prefix="qa-loan",
        provenance=(
            "Questions were written before any results were seen and not tuned afterward, as the note at "
            "the top of loan_fixture.py describes."
        ),
    ),
}


def pick(name: str | None) -> Fixture:
    """The named fixture, or the loan and lease one when no name is given."""
    chosen = name or "loan-lease"
    if chosen not in FIXTURES:
        raise ValueError(f"unknown fixture {chosen!r}, the choices are: {', '.join(FIXTURES)}")
    return FIXTURES[chosen]
