import uuid

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.key_terms import load_key_terms
from app.models import Document

# The key term fields that hold a date worth counting down to or putting in a calendar, by kind of document,
# with the words a person would use for each.
KEY_DATE_FIELDS: dict[str, dict[str, str]] = {
    "lease": {"lease_start": "Lease starts", "lease_end": "Lease ends"},
    "offer": {"start_date": "Job starts"},
    "loan": {"repayment_start": "Repayments start"},
    "other": {"effective_date": "Takes effect"},
}


class KeyDate(BaseModel):
    document_id: str
    field: str
    label: str
    # The date as the document words it, for example "March 9, 2026". The website decides whether it is a
    # clear date it can count down to, so a loose phrase such as "6 months after graduation" is passed on as written.
    value: str


async def saved_key_dates(session: AsyncSession, user_id: uuid.UUID) -> list[KeyDate]:
    """The dates already found in this person's documents, newest document first.

    Only terms that are already saved are read. This never calls the model and never counts against a daily
    limit, so the dashboard can ask for it on every visit. A document whose terms have not been read yet, or are
    only partly saved, simply contributes nothing.
    """
    result = await session.execute(
        select(Document).where(Document.user_id == user_id).order_by(Document.created_at.desc())
    )
    dates: list[KeyDate] = []
    for document in result.scalars().all():
        wanted = KEY_DATE_FIELDS.get(document.doc_type, KEY_DATE_FIELDS["other"])
        saved = await load_key_terms(session, document.id, document.doc_type)
        if saved is None:
            continue
        for term in saved.terms:
            if term.name in wanted and term.found and term.value:
                dates.append(
                    KeyDate(
                        document_id=str(document.id),
                        field=term.name,
                        label=wanted[term.name],
                        value=term.value,
                    )
                )
    return dates
