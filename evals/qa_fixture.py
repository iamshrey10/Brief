"""Questions for the grounded Q&A evaluation.

The first 24 answerable questions are the ones used for the retrieval evaluation, each tied to the
one clause that answers it, and eight more were added on October 17. The first eight unanswerable ones
are about things the fixture document simply never says. Ten more were added on October 17 and are
near misses: the topic is in a clause but the specific fact asked for is not, which is where a model is
most tempted to invent an answer. In every case the only correct behavior is to say the document
doesn't cover it.

The October 17 questions were written before any results were seen for them. One was replaced after the
first run: "How many dollars is the termination fee for ending the lease early?" was answered with "two
months of rent", which is what the clause says and is not an invented figure, so the question was
ambiguous and not the model wrong. That first run scored 17 of 18 on the unanswerable questions with that
one flagged. It was replaced by a question about something no clause mentions, and nothing else was
changed.
"""

from retrieval_fixture import CLAUSES, QUESTIONS

# (question, key of the one clause that answers it, difficulty), the same shape as QUESTIONS
MORE_ANSWERABLE: list[tuple[str, str, str]] = [
    ("How much will I owe if my rent is a week late?", "late_rent", "paraphrase"),
    ("Do I have to pay for water?", "utilities", "paraphrase"),
    ("How much notice do I have to give to leave the lease early?", "early_termination", "lexical"),
    ("How soon after approval is the loan money sent?", "disbursement", "paraphrase"),
    ("After how many payments can the co-signer be released?", "cosigner_release", "lexical"),
    ("Can I pause payments if I am called up for military service?", "deferment", "paraphrase"),
    ("How much notice must the landlord give before coming in?", "entry", "lexical"),
    ("How many days late before the late charge on the loan applies?", "late_fee_loan", "lexical"),
]

ANSWERABLE = QUESTIONS + MORE_ANSWERABLE

UNANSWERABLE: list[str] = [
    "What is the maximum amount I can borrow?",
    "What is the monthly rent?",
    "Who is the landlord?",
    "Is smoking allowed in the unit?",
    "What happens to my loan if I die?",
    "What is the lease start date?",
    "Can I park a car on the property?",
    "What credit score do I need to qualify?",
    # near misses added on October 17: the topic is in a clause, the fact asked for is not
    "How much is the pet deposit?",
    "Who pays the landlord's legal costs if there is a dispute?",
    "How many months of rent is the security deposit?",
    "Is there a discount on the interest rate for paying automatically?",
    "Does the co-signer have to keep paying if I die?",
    "How much notice does the landlord have to give before raising the rent?",
    "Which bank will send the loan money?",
    "Does the landlord need a reason to decline a renewal?",
    "How many people are allowed to live in the unit?",
    "Is the origination fee refundable if I cancel the loan?",
]

__all__ = ["ANSWERABLE", "CLAUSES", "UNANSWERABLE"]
