from dataclasses import dataclass


@dataclass(frozen=True)
class KeyTermField:
    """One fact worth pulling out of a document, like the interest rate.

    `name` is the stable key stored in the database. `label` is what the reader sees.
    `description` tells the model exactly what to look for, so two fields can't be
    confused (a late fee is not an origination fee).
    """

    name: str
    label: str
    description: str


# Kept as plain data, separate from the extraction code, so the lists are easy to read,
# review, and edit without touching a prompt. Every document type gets a short list of the
# facts a person most often needs and most often misses, not an exhaustive legal checklist.
FIELDS_BY_DOC_TYPE: dict[str, tuple[KeyTermField, ...]] = {
    "loan": (
        KeyTermField("lender", "Lender", "The company or person lending the money."),
        KeyTermField("borrower", "Borrower", "The person or people who owe the money."),
        KeyTermField(
            "principal_amount",
            "Amount borrowed",
            "The total amount of money being lent.",
        ),
        KeyTermField(
            "interest_rate",
            "Interest rate",
            "The interest rate or how it is calculated.",
        ),
        KeyTermField(
            "rate_type",
            "Fixed or variable rate",
            "Whether the rate stays the same or can change.",
        ),
        KeyTermField(
            "loan_term", "Length of the loan", "How long the borrower has to repay."
        ),
        KeyTermField(
            "repayment_start",
            "When repayment starts",
            "When the first payment is due, including any grace period after school.",
        ),
        KeyTermField(
            "monthly_payment", "Monthly payment", "The regular payment amount."
        ),
        KeyTermField(
            "origination_fee",
            "Origination fee",
            "A fee charged up front for making the loan.",
        ),
        KeyTermField(
            "late_fee", "Late fee", "The charge for a payment that arrives late."
        ),
        KeyTermField(
            "prepayment_penalty",
            "Fee for paying early",
            "Any charge, or a statement that there is none, for paying the loan off early.",
        ),
        KeyTermField(
            "cosigner", "Cosigner", "Anyone else who is responsible for repaying."
        ),
        KeyTermField(
            "default_terms",
            "What counts as default",
            "What the borrower has to do wrong for the lender to demand repayment.",
        ),
    ),
    "lease": (
        KeyTermField(
            "landlord", "Landlord", "The company or person renting out the property."
        ),
        KeyTermField("tenant", "Tenant", "The person or people renting the property."),
        KeyTermField(
            "property_address", "Property", "The address or unit being rented."
        ),
        KeyTermField("lease_start", "Lease start date", "The date the lease begins."),
        KeyTermField("lease_end", "Lease end date", "The date the lease ends."),
        KeyTermField(
            "monthly_rent", "Monthly rent", "The base rent charged each month."
        ),
        KeyTermField(
            "security_deposit",
            "Security deposit",
            "The deposit held and the rules for returning it.",
        ),
        KeyTermField(
            "nonrefundable_fees",
            "Non-refundable fees",
            "Any fee that will not be returned, such as an application or admin fee.",
        ),
        KeyTermField("late_fee", "Late fee", "The charge for rent that arrives late."),
        KeyTermField(
            "utilities",
            "Utilities",
            "Which utilities the tenant pays for and which are included.",
        ),
        KeyTermField(
            "early_termination",
            "Leaving early",
            "What happens, and what it costs, if the tenant ends the lease early.",
        ),
        KeyTermField(
            "renewal",
            "Renewal",
            "How the lease renews or ends, and any notice that must be given.",
        ),
    ),
    "offer": (
        KeyTermField("employer", "Employer", "The company making the offer."),
        KeyTermField("job_title", "Job title", "The role being offered."),
        KeyTermField("start_date", "Start date", "The first day of work."),
        KeyTermField(
            "base_salary", "Base salary", "The regular pay, and how often it is paid."
        ),
        KeyTermField("bonus", "Bonus", "Any signing, performance, or other bonus."),
        KeyTermField(
            "equity", "Stock or equity", "Any stock options or shares offered."
        ),
        KeyTermField(
            "benefits",
            "Benefits",
            "Health insurance, time off, retirement, and similar.",
        ),
        KeyTermField(
            "at_will",
            "At-will employment",
            "Whether either side can end the job at any time.",
        ),
        KeyTermField(
            "non_compete",
            "Non-compete or non-solicit",
            "Limits on working for competitors or contacting customers after leaving.",
        ),
        KeyTermField(
            "repayment_clause",
            "Money you may have to repay",
            "Any signing bonus, relocation, or training cost that must be repaid if you leave.",
        ),
    ),
    "other": (
        KeyTermField(
            "parties", "Who is involved", "The people or companies that agree to this."
        ),
        KeyTermField(
            "effective_date", "Start date", "When the agreement takes effect."
        ),
        KeyTermField(
            "term", "How long it lasts", "How long the agreement runs, or its end date."
        ),
        KeyTermField(
            "payments",
            "Money owed",
            "Amounts that have to be paid, and when they are due.",
        ),
        KeyTermField(
            "termination",
            "Ending it",
            "How either side can end the agreement and what that costs.",
        ),
        KeyTermField(
            "penalties",
            "Penalties and fees",
            "Charges for late payment, breaking the agreement, or similar.",
        ),
    ),
}


def fields_for(doc_type: str) -> tuple[KeyTermField, ...]:
    """The fields to extract for a document type, falling back to the generic list."""
    return FIELDS_BY_DOC_TYPE.get(doc_type, FIELDS_BY_DOC_TYPE["other"])
