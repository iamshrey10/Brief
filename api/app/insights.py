import uuid

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.checklist import load_checklist
from app.key_terms import load_key_terms
from app.models import Document

# How many open questions are named for one document, so one long checklist cannot crowd out the others.
MAX_OPEN_QUESTIONS = 4


class DocumentInsight(BaseModel):
    document_id: str
    # How many of the key terms for this kind of document were found, and how many there are. None until the key terms were read.
    terms_found: int | None = None
    terms_total: int | None = None
    # How many of the questions people most often skip the document answers, and the wording to ask the other side
    # for the important ones it leaves open. None and empty until the questions were checked.
    questions_answered: int | None = None
    open_count: int | None = None
    open_questions: list[str] = []


async def saved_insights(session: AsyncSession, user_id: uuid.UUID) -> list[DocumentInsight]:
    """What Brief has already worked out about each of this person's documents, newest document first.

    Only results that are already saved are read. This never calls the model and never counts against a daily limit,
    so the dashboard can ask for it on every visit. A document that has not been opened yet has nothing saved, and
    is left out rather than read just to be shown.
    """
    result = await session.execute(
        select(Document).where(Document.user_id == user_id).order_by(Document.created_at.desc())
    )
    insights: list[DocumentInsight] = []
    for document in result.scalars().all():
        terms = await load_key_terms(session, document.id, document.doc_type)
        checklist = await load_checklist(session, document.id, document.doc_type)
        if terms is None and checklist is None:
            continue
        insight = DocumentInsight(document_id=str(document.id))
        if terms is not None:
            insight.terms_total = len(terms.terms)
            insight.terms_found = sum(1 for term in terms.terms if term.found)
        if checklist is not None:
            open_wording = [
                answer.ask_them
                for answer in checklist.answers
                if answer.status == "not_mentioned" and answer.gap and answer.ask_them
            ]
            insight.questions_answered = sum(1 for answer in checklist.answers if answer.status == "answered")
            insight.open_count = len(open_wording)
            insight.open_questions = open_wording[:MAX_OPEN_QUESTIONS]
        insights.append(insight)
    return insights
