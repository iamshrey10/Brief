"""A third fixture for the question answering evaluation: a made up education loan, 17 short clauses, 24 questions the
loan answers and 18 it does not, ten of those near misses where the topic is in a clause but the specific fact asked for is
not. Written on October 25 before any result had been seen for it, and not tuned afterward. Questions avoid asking for one
kind of figure where a clause gives another.
"""

CLAUSES: dict[str, str] = {
    "principal": "The lender agrees to lend the borrower a total of forty thousand dollars for tuition and required fees.",
    "rate": "The loan has a variable interest rate that is reset every January based on a published benchmark, and it can never exceed eleven percent.",
    "in_school": "While the borrower is enrolled at least half time, no payments are due, but interest still accrues.",
    "capitalization": "Unpaid interest is added to the principal when repayment begins.",
    "repayment_term": "After the grace period, the borrower repays the loan in equal monthly installments over ten years.",
    "grace": "The grace period lasts six months after the borrower stops being enrolled at least half time.",
    "autopay": "The interest rate is reduced by one quarter of a percentage point when payments are made automatically from a bank account.",
    "late": "A payment more than ten days late adds a charge of four percent of the overdue amount.",
    "prepay": "The borrower may pay extra or pay off the loan early without any fee.",
    "cosigner": "A co-signer is required and is equally responsible for repaying the loan.",
    "death": "If the borrower dies or becomes permanently disabled, the loan is cancelled and the co-signer owes nothing.",
    "forbearance": "The lender may allow up to twelve months of paused payments for financial hardship, during which interest continues to accrue.",
    "default": "The loan is in default after one hundred twenty days without a payment, and the lender may then demand the full balance.",
    "credit_reporting": "The lender reports the loan and the payment history to the credit bureaus every month.",
    "disbursement": "The money is sent directly to the school in two equal payments, one at the start of each term.",
    "refund": "If the borrower withdraws, the school returns the unspent money to the lender and the loan is reduced by that amount.",
    "tax": "The lender will send the borrower a form each year showing how much interest was paid.",
}

# (question, key of the one clause that answers it, difficulty), the same shape as the other fixtures
ANSWERABLE: list[tuple[str, str, str]] = [
    ("How much is being lent?", "principal", "lexical"),
    ("How long is the repayment term?", "repayment_term", "lexical"),
    ("How long is the grace period?", "grace", "lexical"),
    ("Is there a fee for paying the loan off early?", "prepay", "lexical"),
    ("Is a co-signer required?", "cosigner", "lexical"),
    ("After how many days without a payment is the loan in default?", "default", "lexical"),
    ("What is the highest the interest rate can go?", "rate", "paraphrase"),
    ("Do I owe anything while I am still in school?", "in_school", "paraphrase"),
    ("Does unpaid interest get added to what I owe?", "capitalization", "paraphrase"),
    ("Is there a discount for automatic payments?", "autopay", "paraphrase"),
    ("What happens if I pay late?", "late", "paraphrase"),
    ("What happens to the loan if I die?", "death", "paraphrase"),
    ("Where does the money go?", "disbursement", "paraphrase"),
    ("Will this show up on my credit report?", "credit_reporting", "paraphrase"),
    ("Can I pause payments if I lose my job?", "forbearance", "paraphrase"),
    ("What if I drop out of school?", "refund", "paraphrase"),
    ("Will I get a tax form for the interest?", "tax", "paraphrase"),
    ("Does the rate stay the same for the whole loan?", "rate", "hard"),
    ("Does my co-signer have to pay if I cannot?", "cosigner", "hard"),
    ("If I pause payments does my balance still grow?", "forbearance", "hard"),
    ("Is it cheaper to pay by automatic withdrawal?", "autopay", "hard"),
    ("Will my family still owe anything if I become disabled?", "death", "hard"),
    ("Do I pay interest during the months before payments start?", "in_school", "hard"),
    ("How many payments will I make in total?", "repayment_term", "hard"),
]

UNANSWERABLE: list[str] = [
    "What is the name of the lender?",
    "What school is the loan for?",
    "What is the borrower's name?",
    "Who collects the payments?",
    "What is the loan number?",
    "What is the customer service phone number?",
    "What is the start date of the loan?",
    "Is this a federal or a private loan?",
    # near misses: the topic is in a clause, the fact asked for is not
    "Which benchmark is the rate based on?",
    "What is the interest rate today?",
    "What is the monthly payment?",
    "How much interest will I pay in total?",
    "Is the automatic payment discount available during the grace period?",
    "How do I apply for forbearance?",
    "When in January is the rate reset?",
    "Can the co-signer be released from the loan later?",
    "How many days late before the lender reports it to the credit bureaus?",
    "What happens if I pay only part of an installment?",
]
