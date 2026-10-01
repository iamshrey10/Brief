"""Labeled fixture for the retrieval evaluation: a small mixed loan and lease agreement,
and questions each tied to the one clause that actually answers it.

Written before any results were seen and not tuned afterward, the point is to measure
the retrieval stack as it is, not to pick questions it happens to handle well.
Several clauses deliberately share words (fee, late, deposit) so a keyword match alone
can land on the wrong one.
"""

CLAUSES: dict[str, str] = {
    "origination_fee": "An origination fee of one percent of the principal is deducted from the loan amount at disbursement.",
    "interest_rate": "Interest accrues at a fixed rate of six point eight percent per year, calculated daily on the outstanding principal.",
    "disbursement": "The full loan amount will be disbursed in a single payment within five business days of final approval.",
    "grace_period": "Repayment begins six months after the borrower graduates, leaves school, or drops below half-time enrollment.",
    "prepayment": "The borrower may prepay all or part of the loan at any time without penalty.",
    "late_fee_loan": "A late charge of five percent of the overdue installment applies if a payment is more than fifteen days late.",
    "cosigner_release": "The co-signer may be released after thirty-six consecutive on-time payments and a credit review of the primary borrower.",
    "default_loan": "The loan is in default if no payment is received for ninety consecutive days, and the entire balance then becomes due.",
    "deferment": "Payments may be paused during periods of active military service or approved economic hardship.",
    "security_deposit": "The security deposit is refundable within thirty days after move-out, less deductions for damage beyond normal wear.",
    "late_rent": "Rent is due on the first of the month; a late fee of fifty dollars applies after the fifth day.",
    "pets": "No animals are permitted in the unit without the landlord's prior written approval and an additional pet deposit.",
    "subletting": "The tenant may not sublet or assign the lease to another person without written consent of the landlord.",
    "early_termination": "The tenant may end the lease early by giving sixty days written notice and paying a termination fee equal to two months of rent.",
    "renewal": "Unless either party gives notice ninety days before expiry, the lease renews automatically for another twelve months.",
    "entry": "The landlord may enter the unit with twenty-four hours notice for inspections and repairs, except in emergencies.",
    "utilities": "The tenant is responsible for electricity, gas, and internet; water and trash are included in the rent.",
}

# (question, key of the one clause that answers it, difficulty)
#   lexical    shares most of its key words with the answering clause
#   paraphrase asks for the same thing in different words
#   hard       indirect or situational, the answer has to be inferred
QUESTIONS: list[tuple[str, str, str]] = [
    ("What is the interest rate on the loan?", "interest_rate", "lexical"),
    ("How much is the late fee on rent?", "late_rent", "lexical"),
    ("Is there an origination fee?", "origination_fee", "lexical"),
    ("Can I sublet the apartment?", "subletting", "lexical"),
    ("What happens if the loan goes into default?", "default_loan", "lexical"),
    ("When is the security deposit returned?", "security_deposit", "lexical"),
    ("Can I pay off my loan early without being charged extra?", "prepayment", "paraphrase"),
    ("How long after I graduate until I have to start paying?", "grace_period", "paraphrase"),
    ("Do I get all the money upfront or in installments?", "disbursement", "paraphrase"),
    ("Can my parent come off the loan later?", "cosigner_release", "paraphrase"),
    ("Am I allowed to have a cat?", "pets", "paraphrase"),
    ("What if I need to move out before the lease is over?", "early_termination", "paraphrase"),
    ("Does the lease continue on its own at the end?", "renewal", "paraphrase"),
    ("Who pays for the wifi and power?", "utilities", "paraphrase"),
    ("Can the landlord just walk in whenever?", "entry", "paraphrase"),
    ("What if I pay my loan installment a few weeks late?", "late_fee_loan", "paraphrase"),
    ("I lost my job, can I stop making payments for a while?", "deferment", "hard"),
    ("Will I get my money back when I leave if I scuff the walls?", "security_deposit", "hard"),
    ("What if I stop paying for three months?", "default_loan", "hard"),
    ("How many months of rent do I owe if I break the lease?", "early_termination", "hard"),
    ("Can my friend take over my place when I leave?", "subletting", "hard"),
    ("Is the money I actually receive less than what I borrowed?", "origination_fee", "hard"),
    ("Is the rate going to change over time?", "interest_rate", "hard"),
    ("Do I need permission to bring a dog and is there an extra charge?", "pets", "hard"),
]
