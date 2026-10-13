from pydantic import BaseModel

# The most quotes that may back one answer or one key term. A fact is sometimes spread over a few
# sentences, an amount in one and its rule in the next, but more than three is a sign of a vague answer.
MAX_EVIDENCE = 3


class Evidence(BaseModel):
    """What the model says backs a fact: a quote and the label of the clause it is from, like C2."""

    clause_ref: str
    quote: str


class EvidenceOut(BaseModel):
    """A quote that was checked word for word against its clause, and where to find it."""

    clause_id: str
    page_number: int
    quote: str
