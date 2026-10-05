"""Ground truth for the must-ask checklist evaluation.

Two short documents, a loan note and a lease, written the way real contracts come out of a PDF:
numbers as digits, sentences broken across lines, a flattened fee table, and filler clauses that
answer nothing. Several of the checklist questions are deliberately never answered, including
important ones like paying a loan off early, so a model that makes up an answer is caught, and
the gaps are real.

The expected answers were written before any results were seen and not tuned afterward. One
thing was added later and is stated here so nobody has to guess: the first run on these documents
scored 100 percent, then a real lease showed the model calling a question answered when a clause
only mentioned the topic in passing, without stating the amount or rule. So each document now has
a decoy clause that mentions a topic without answering it ("obligation" in the loan, "other_charges"
in the lease). The expected answers did not change.

Each question is scored against an Expect, or None when the document does not answer it. An
Expect names the clause (or clauses) that answers it, and the words the answer must contain:
any_words means at least one of them, all_words means every one. Words are lowercase
fragments, matched inside the lowercased answer. The fee question needs two separate quotes, one
per fee, because the fees sit on lines that are not next to each other.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Expect:
    clauses: tuple[str, ...]
    any_words: tuple[str, ...] = ()
    all_words: tuple[str, ...] = ()


LOAN_CLAUSES: dict[str, str] = {
    "parties": (
        "PROMISSORY NOTE\nLender: Northgate Student Finance, Inc.\nBorrower: Jordan Avery Patel\n"
        "Principal Amount: $18,500.00\nNote Date: August 12, 2026"
    ),
    "promise": (
        "1. PROMISE TO PAY. The Borrower promises to pay the Lender the principal\n"
        "amount, plus interest, in monthly installments as set out in the\n"
        "repayment schedule attached to this Note."
    ),
    "interest": (
        "2. INTEREST. Interest accrues at a variable annual rate equal to the\n"
        "30-day average SOFR plus 4.25%, adjusted on the first day of each month.\n"
        "The rate will never exceed 11.95% per year."
    ),
    "fee": (
        "3. ORIGINATION FEE. A fee of 2.5% of the principal amount ($462.50) will be\n"
        "deducted from the loan proceeds before they are paid out to the school."
    ),
    "repayment": (
        "4. REPAYMENT. Repayment begins 6 months after the Borrower graduates or\n"
        "ceases to be enrolled at least half-time. Interest that accrues before\n"
        "repayment begins will be added to the principal balance at that time."
    ),
    "late": (
        "5. LATE CHARGE. If a payment is not received within 10 days after its due\n"
        "date, a late charge of 4% of the overdue payment will be assessed."
    ),
    "default": (
        "6. DEFAULT. The Borrower is in default if any payment is more than 90 days\n"
        "past due. On default, the entire unpaid balance and all accrued interest\n"
        "become immediately due and payable."
    ),
    "amend": (
        "7. AMENDMENTS. The Lender may amend this Note by giving the Borrower\n"
        "30 days written notice of the change."
    ),
    "law": "8. GOVERNING LAW. This Note is governed by the laws of the State of Delaware.",
    "notices": (
        "9. NOTICES. All notices must be in writing and delivered to the addresses\nshown above."
    ),
    # Decoy: mentions the total owed but never states a total, so total_cost stays unanswered.
    "obligation": (
        "10. OBLIGATION. The Borrower remains responsible for all amounts owed under\n"
        "this Note until they are paid in full."
    ),
}

# Keyed by checklist question id. None means the note never answers it.
LOAN_EXPECTED: dict[str, Expect | None] = {
    "prepayment": None,
    "interest_rate": Expect(("interest",), any_words=("variable", "sofr", "4.25", "11.95")),
    "upfront_fees": Expect(("fee",), any_words=("2.5", "462.50")),
    "repayment_start": Expect(("repayment",), any_words=("6 months",)),
    "late_payment": Expect(("late",), any_words=("4%", "10 days")),
    "default": Expect(("default",), any_words=("90",)),
    "cosigner": None,
    "hardship": None,
    "changes": Expect(("amend",), any_words=("30 days",)),
    "total_cost": None,
}

LEASE_CLAUSES: dict[str, str] = {
    "parties": (
        "RESIDENTIAL LEASE AGREEMENT\nLandlord: Birchwood Property Management LLC\n"
        "Tenant: Casey Morgan Lee\nPremises: 2210 N Mill Avenue, Unit 14, Tempe, AZ 85281"
    ),
    "term": "1. TERM. The lease begins on January 1, 2027 and ends on December 31, 2027.",
    "rent": (
        "2. RENT. Monthly rent is $1,875.00, due on the 1st of each month.\n"
        "A late fee of $75.00 will be charged if rent is received after the 5th."
    ),
    "deposit": (
        "3. SECURITY DEPOSIT. Tenant will pay a security deposit of $1,875.00.\n"
        "The deposit will be returned within 30 days after Tenant moves out,\n"
        "less any deductions for damage beyond normal wear and tear."
    ),
    "movein": (
        "4. MOVE-IN COSTS\nAdministrative Fee: $200.00 (non-refundable)\nTAX (0.0)\n$0.00\n"
        "Pet Fee: $350.00 (non-refundable)\nTOTAL DUE AT SIGNING: $2,425.00"
    ),
    "utilities": (
        "5. UTILITIES. Tenant pays for electricity and internet. Water, sewer, and\n"
        "trash are included in the rent."
    ),
    "maintenance": (
        "6. MAINTENANCE. Tenant must report repair needs in writing. Landlord will\n"
        "make non-emergency repairs within 14 days of receiving notice."
    ),
    "entry": (
        "7. ENTRY. Landlord may enter the unit with at least 24 hours notice,\n"
        "except in an emergency."
    ),
    "assignment": (
        "8. ASSIGNMENT. Tenant may not sublet or assign this lease without the\n"
        "Landlord's written consent."
    ),
    "pets": "9. PETS. One cat or dog weighing under 40 pounds is permitted.",
    "law": "10. GOVERNING LAW. This lease is governed by the laws of the State of Arizona.",
    # Decoy: names an early termination fee and late fees but states neither an amount nor a rule,
    # so early_termination stays unanswered.
    "other_charges": (
        "11. OTHER CHARGES. Tenant remains responsible for any early termination fee, late\n"
        "fees, or other charges that are unpaid when this lease ends."
    ),
}

LEASE_EXPECTED: dict[str, Expect | None] = {
    "early_termination": None,
    "auto_renewal": None,
    "security_deposit": Expect(("deposit",), any_words=("1,875", "30 days")),
    "nonrefundable_fees": Expect(("movein",), all_words=("$200", "$350")),
    "rent_increase": None,
    "late_fee": Expect(("rent",), any_words=("$75",)),
    "repairs": Expect(("maintenance",), any_words=("14 days",)),
    "landlord_entry": Expect(("entry",), any_words=("24 hours",)),
    "subletting": Expect(("assignment",), any_words=("consent", "sublet")),
    "utilities": Expect(("utilities",), any_words=("electric", "internet")),
}

DOCUMENTS = {
    "loan": {"clauses": LOAN_CLAUSES, "expected": LOAN_EXPECTED},
    "lease": {"clauses": LEASE_CLAUSES, "expected": LEASE_EXPECTED},
}
