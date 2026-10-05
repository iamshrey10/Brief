from dataclasses import dataclass
from typing import Literal

Importance = Literal["high", "medium"]


@dataclass(frozen=True)
class ChecklistQuestion:
    """One question a careful reader should get answered before signing.

    `question` is what the reader wants to know. `why_it_matters` is one plain sentence on what
    goes wrong when it is missed. `ask_them` is how to put it to the other side, used when the
    document itself is silent. `importance` decides whether silence is worth flagging: a
    high question the document does not answer is called out as a gap.
    """

    id: str
    question: str
    why_it_matters: str
    ask_them: str
    importance: Importance


# Plain data, kept apart from any prompt so the wording is easy to read, review, and change.
# These are things to ask and check, not legal advice, and none of them tells anyone whether to
# sign. Each list is short on purpose: the questions people most often skip, not every clause
# a lawyer would read.
CHECKLISTS: dict[str, tuple[ChecklistQuestion, ...]] = {
    "loan": (
        ChecklistQuestion(
            "prepayment",
            "Can I pay this loan off early, and does it cost anything?",
            "Some loans charge a fee for paying early, which punishes you for being responsible.",
            "Is there any fee or penalty if I pay the loan off early?",
            "high",
        ),
        ChecklistQuestion(
            "interest_rate",
            "What is the interest rate, and can it change?",
            "A rate that looks low today can climb if it is variable, and a small difference "
            "adds up over years.",
            "Is the rate fixed for the whole loan, and if not, what is the highest it can reach?",
            "high",
        ),
        ChecklistQuestion(
            "upfront_fees",
            "Is any fee taken out before I receive the money?",
            "A fee deducted at the start means you get less than you borrowed but owe interest "
            "on the full amount.",
            "Is there an origination or other fee, and is it taken out of the amount I receive?",
            "high",
        ),
        ChecklistQuestion(
            "repayment_start",
            "When do payments start, and does interest grow before then?",
            "Interest can pile up while you are still in school and be added to what you owe.",
            "Does interest build up during school or the grace period, and is it added to my "
            "balance?",
            "high",
        ),
        ChecklistQuestion(
            "late_payment",
            "What happens if I pay late?",
            "Late charges and credit damage can follow a payment that is only a few days behind.",
            "How late can a payment be before a fee is charged, and how much is the fee?",
            "medium",
        ),
        ChecklistQuestion(
            "default",
            "What counts as default, and what happens if it does?",
            "Default can make the whole balance due at once.",
            "How many missed payments put the loan in default, and what happens next?",
            "high",
        ),
        ChecklistQuestion(
            "cosigner",
            "Is there a cosigner, and can they ever be released?",
            "A cosigner is fully responsible for the debt, and release rules are often strict.",
            "What would it take to release the cosigner from the loan?",
            "medium",
        ),
        ChecklistQuestion(
            "hardship",
            "Can I pause payments if I lose my job or hit a hardship?",
            "Without a pause option, a bad few months can turn into default.",
            "What options do I have if I cannot make payments for a while, and does interest "
            "keep growing during a pause?",
            "medium",
        ),
        ChecklistQuestion(
            "changes",
            "Can the lender change the terms after I sign?",
            "Terms that can change later are terms you have not really agreed to yet.",
            "Under what circumstances can any term of this loan be changed, and how would I be "
            "told?",
            "medium",
        ),
        ChecklistQuestion(
            "total_cost",
            "How much will I pay in total over the life of the loan?",
            "The monthly payment hides the full cost, which can be far above the amount borrowed.",
            "Can you show me the total I will repay, including interest and fees?",
            "medium",
        ),
    ),
    "lease": (
        ChecklistQuestion(
            "early_termination",
            "What does it cost to leave before the lease ends?",
            "Breaking a lease can mean paying months of rent you will not use.",
            "If I need to move out early, what notice and what fee would apply?",
            "high",
        ),
        ChecklistQuestion(
            "auto_renewal",
            "Does the lease renew by itself, and how much notice do I have to give?",
            "Missing a notice window can lock you in for another full term.",
            "Does this lease renew automatically, and by what date must I tell you if I am leaving?",
            "high",
        ),
        ChecklistQuestion(
            "security_deposit",
            "How much is the deposit, and when and how do I get it back?",
            "Unclear return rules are how deposits get lost to vague deductions.",
            "How much is the deposit, how long until it is returned, and what can be deducted?",
            "high",
        ),
        ChecklistQuestion(
            "nonrefundable_fees",
            "Are there fees I will never get back?",
            "Application, administrative, and similar fees add to the real cost of moving in.",
            "Which fees are non-refundable, and what is the total due at move-in?",
            "high",
        ),
        ChecklistQuestion(
            "rent_increase",
            "Can the rent go up, and by how much?",
            "A rent increase can change what you can afford, especially after a renewal.",
            "Can the rent increase during the lease or at renewal, and with how much notice?",
            "high",
        ),
        ChecklistQuestion(
            "late_fee",
            "What is the late fee, and when does it start?",
            "A short grace period and a large fee make a small delay expensive.",
            "How many days after the due date is a late fee charged, and how much is it?",
            "medium",
        ),
        ChecklistQuestion(
            "repairs",
            "Who pays for repairs and how fast must they be done?",
            "Without a stated timeline, a broken heater or leak can wait a long time.",
            "Who is responsible for repairs, and how do I report a problem?",
            "medium",
        ),
        ChecklistQuestion(
            "landlord_entry",
            "When can the landlord enter my home?",
            "Entry rules decide how much privacy you actually have.",
            "How much notice is given before anyone enters the unit?",
            "medium",
        ),
        ChecklistQuestion(
            "subletting",
            "Can I sublet or hand the lease to someone else?",
            "If your plans change, subletting can be the difference between a small loss and a "
            "large one.",
            "Is subletting or transferring the lease allowed, and with whose approval?",
            "medium",
        ),
        ChecklistQuestion(
            "utilities",
            "Which bills are mine and which are included?",
            "Utilities can add a large amount to the real monthly cost.",
            "Which utilities are included in the rent, and which do I set up and pay myself?",
            "medium",
        ),
    ),
    "offer": (
        ChecklistQuestion(
            "at_will",
            "Can the job be ended at any time, by either side?",
            "At-will employment means the offer is not a promise of how long the job lasts.",
            "Is this role at-will, and is there any notice or severance if it ends?",
            "high",
        ),
        ChecklistQuestion(
            "base_pay",
            "What exactly is the pay, and how often is it paid?",
            "A salary figure can leave out how it is paid or when it is reviewed.",
            "Can you confirm the base pay, the pay schedule, and when pay is reviewed?",
            "high",
        ),
        ChecklistQuestion(
            "bonus_conditions",
            "What do I have to do to earn a bonus, and is it guaranteed?",
            "A bonus described as a number may depend on conditions that are not in your control.",
            "Is any bonus guaranteed, and what conditions apply to earning and keeping it?",
            "medium",
        ),
        ChecklistQuestion(
            "equity_vesting",
            "If there is stock, when do I actually own it?",
            "Equity usually vests over years, and leaving early can mean losing most of it.",
            "What is the vesting schedule, and what happens to unvested shares if I leave?",
            "medium",
        ),
        ChecklistQuestion(
            "repay_if_leave",
            "Do I have to pay anything back if I leave?",
            "Signing, relocation, and training money can come with a repayment clause.",
            "Is any bonus or cost repayable if I leave, and for how long after I start?",
            "high",
        ),
        ChecklistQuestion(
            "non_compete",
            "Does it limit where I can work after I leave?",
            "A non-compete or non-solicit can shape your next job before you have left this one.",
            "Is there any non-compete or non-solicit, and what does it cover and for how long?",
            "high",
        ),
        ChecklistQuestion(
            "ip_ownership",
            "Who owns what I create, including on my own time?",
            "Broad wording can claim side projects you built outside of work.",
            "Does the company claim anything I make outside work hours or with my own tools?",
            "high",
        ),
        ChecklistQuestion(
            "benefits_start",
            "When do my benefits begin?",
            "Health coverage and time off sometimes start weeks or months after the job does.",
            "On what date does health coverage start, and how is time off earned?",
            "medium",
        ),
        ChecklistQuestion(
            "contingencies",
            "Is the offer conditional on anything?",
            "Background checks and similar conditions can still undo an offer you have accepted.",
            "What checks or conditions must be met before my start date?",
            "medium",
        ),
        ChecklistQuestion(
            "start_and_location",
            "Where will I work, and can that change?",
            "A location or schedule that can change at the employer's choice is part of the deal.",
            "Is my work location fixed, and can it be changed without my agreement?",
            "medium",
        ),
    ),
    "other": (
        ChecklistQuestion(
            "payments",
            "What do I owe, and when is it due?",
            "A due date you miss can trigger fees you did not plan for.",
            "Can you list every payment I will owe, with amounts and dates?",
            "high",
        ),
        ChecklistQuestion(
            "termination",
            "How can I end this, and what does it cost?",
            "Exit terms are easiest to read before you are trying to use them.",
            "How can either side end this agreement, with what notice, and at what cost?",
            "high",
        ),
        ChecklistQuestion(
            "auto_renewal",
            "Does it renew by itself, and how much notice is needed to stop it?",
            "An automatic renewal can run for another full term if you miss the window.",
            "Does this renew automatically, and by what date must I cancel?",
            "high",
        ),
        ChecklistQuestion(
            "penalties",
            "Which fees and penalties could apply to me?",
            "Penalties are rarely visible until the day they are charged.",
            "What fees or penalties apply if something goes wrong, and how much are they?",
            "high",
        ),
        ChecklistQuestion(
            "changes",
            "Can the other side change the terms after I sign?",
            "Terms that can change later are terms you have not fully agreed to.",
            "Can any term be changed after signing, and how would I be told?",
            "medium",
        ),
        ChecklistQuestion(
            "disputes",
            "How are disagreements settled?",
            "Some agreements send disputes to private arbitration instead of a court.",
            "If we disagree, where and how is it settled, and who pays for that?",
            "medium",
        ),
    ),
}


def questions_for(doc_type: str) -> tuple[ChecklistQuestion, ...]:
    """The checklist for a document type, falling back to the generic list."""
    return CHECKLISTS.get(doc_type, CHECKLISTS["other"])
