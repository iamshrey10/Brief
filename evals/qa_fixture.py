"""Questions for the grounded Q&A evaluation.

The answerable questions are the same 24 used for the retrieval evaluation, each tied to the
one clause that answers it. The unanswerable ones are about things the fixture document
simply never says, so the only correct behavior is to say the document doesn't cover it.

Written before any results were seen and not tuned afterward.
"""

from retrieval_fixture import CLAUSES, QUESTIONS

ANSWERABLE = QUESTIONS

UNANSWERABLE: list[str] = [
    "What is the maximum amount I can borrow?",
    "What is the monthly rent?",
    "Who is the landlord?",
    "Is smoking allowed in the unit?",
    "What happens to my loan if I die?",
    "What is the lease start date?",
    "Can I park a car on the property?",
    "What credit score do I need to qualify?",
]

__all__ = ["ANSWERABLE", "CLAUSES", "UNANSWERABLE"]
