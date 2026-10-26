"""Ground truth for the key-terms evaluation.

The 17-clause mixed fixture from the retrieval evaluation is split into a loan document and a
lease document, and a job offer (offer_fixture.py) is the third. For every key-term field of that document type this says which clause states
it, or None when the document genuinely does not. Most fields are None on purpose: the
fixture never names a lender, an amount, a rent, or a date, so a model that fills those in is
inventing them.

Written before any results were seen and not tuned afterward.

Each entry is None (the document does not state it) or (clause key, accepted words). The
accepted words are lowercase fragments, and a found value must contain at least one of them,
so "6.8%" and "six point eight percent" both count. An empty list means only the clause is
checked.
"""

from offer_fixture import CLAUSES as OFFER_CLAUSES
from retrieval_fixture import CLAUSES

LOAN_KEYS = [
    "origination_fee",
    "interest_rate",
    "disbursement",
    "grace_period",
    "prepayment",
    "late_fee_loan",
    "cosigner_release",
    "default_loan",
    "deferment",
]
LEASE_KEYS = [
    "security_deposit",
    "late_rent",
    "pets",
    "subletting",
    "early_termination",
    "renewal",
    "entry",
    "utilities",
]

Expected = tuple[str, list[str]] | None

LOAN_EXPECTED: dict[str, Expected] = {
    "lender": None,
    "principal_amount": None,
    "interest_rate": ("interest_rate", ["6.8", "six point eight"]),
    "rate_type": ("interest_rate", ["fixed"]),
    "loan_term": None,
    "repayment_start": ("grace_period", ["six months", "6 months"]),
    "monthly_payment": None,
    "origination_fee": ("origination_fee", ["one percent", "1%", "1 percent"]),
    "late_fee": ("late_fee_loan", ["five percent", "5%", "5 percent"]),
    "prepayment_penalty": (
        "prepayment",
        ["without penalty", "no penalty", "no fee", "no charge", "none", "free"],
    ),
    "cosigner": ("cosigner_release", ["co-signer", "cosigner", "thirty-six", "36"]),
    "default_terms": ("default_loan", ["ninety", "90"]),
}

# Fields left out of scoring because the fixture text is honestly ambiguous for them:
# "the borrower" is mentioned but never named, so whether that counts as stating the
# borrower is a judgment call, not a clear right or wrong.
LOAN_AMBIGUOUS = {"borrower"}

LEASE_EXPECTED: dict[str, Expected] = {
    "landlord": None,
    "tenant": None,
    "property_address": None,
    "lease_start": None,
    "lease_end": None,
    "monthly_rent": None,
    "security_deposit": ("security_deposit", ["thirty days", "30 days", "refundable"]),
    "late_fee": ("late_rent", ["fifty", "$50", "50"]),
    "utilities": ("utilities", ["electricity", "gas", "internet"]),
    "early_termination": ("early_termination", ["sixty", "60", "two months"]),
    "renewal": ("renewal", ["ninety", "90", "twelve", "12", "automatic"]),
}

# The termination fee and pet deposit are fees, but the text never calls them
# non-refundable, so whether they belong in that field is a judgment call.
LEASE_AMBIGUOUS = {"nonrefundable_fees"}

# The job offer, added on October 25 and written before any result was seen for it. Employer and job title are
# never named in the fixture, so a model that fills them in is inventing them. `bonus` is stated in two clauses (the
# signing bonus and the annual one), so which clause a model picks first is a judgment call and it is not scored.
OFFER_EXPECTED: dict[str, Expected] = {
    "employer": None,
    "job_title": None,
    "start_date": ("start_date", ["first monday", "monday", "next month"]),
    "base_salary": ("base_salary", ["120", "one hundred twenty", "two weeks", "every two"]),
    "equity": ("equity_grant", ["4,000", "four thousand", "4000", "options", "vest"]),
    "benefits": ("benefits", ["health", "dental", "vision", "80", "eighty"]),
    "at_will": ("at_will", ["at will", "at-will", "any time", "either"]),
    "non_compete": ("noncompete", ["twelve", "12", "competitor"]),
    "repayment_clause": ("signing_bonus", ["repay", "repaid", "twelve months", "12 months", "15,000", "fifteen"]),
}
OFFER_AMBIGUOUS = {"bonus"}

DOCUMENTS = {
    "loan": {
        "clauses": {key: CLAUSES[key] for key in LOAN_KEYS},
        "expected": LOAN_EXPECTED,
        "ambiguous": LOAN_AMBIGUOUS,
    },
    "lease": {
        "clauses": {key: CLAUSES[key] for key in LEASE_KEYS},
        "expected": LEASE_EXPECTED,
        "ambiguous": LEASE_AMBIGUOUS,
    },
    "offer": {
        "clauses": OFFER_CLAUSES,
        "expected": OFFER_EXPECTED,
        "ambiguous": OFFER_AMBIGUOUS,
    },
}
