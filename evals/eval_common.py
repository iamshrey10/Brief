"""Pieces shared by the evaluations that run over a small labeled document: building a
temporary document without embeddings, and formatting a count as a percentage."""

from retrieval_eval import EVAL_EMAIL
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Clause, Document, User


async def build_document(
    session: AsyncSession, doc_type: str, clauses: dict[str, str], label: str
) -> tuple[Document, User, dict[str, str]]:
    """Creates a temporary ready document whose clauses are `clauses`, in order. Returns it,
    its owner, and a map from each clause's id to the key it was given, so a result can be
    scored by which clause it pointed at. No embeddings, these evaluations read whole
    documents and never search."""
    user = (await session.execute(select(User).where(User.email == EVAL_EMAIL))).scalar_one_or_none()
    if user is None:
        user = User(email=EVAL_EMAIL)
        session.add(user)
        await session.flush()

    document = Document(
        user_id=user.id,
        filename=f"{label}-eval-{doc_type}.pdf",
        doc_type=doc_type,
        status="ready",
        storage_key=f"eval/{label}-{doc_type}.pdf",
        file_size_bytes=0,
        content_type="application/pdf",
    )
    session.add(document)
    await session.flush()

    clause_key_by_id: dict[str, str] = {}
    for index, (key, text) in enumerate(clauses.items()):
        clause = Clause(
            document_id=document.id,
            clause_index=index,
            page_number=1,
            char_start=0,
            char_end=len(text),
            text=text,
        )
        session.add(clause)
        await session.flush()
        clause_key_by_id[str(clause.id)] = key

    await session.commit()
    return document, user, clause_key_by_id


def percent(part: int, total: int) -> str:
    return f"{part / total:.0%} ({part}/{total})" if total else "n/a"
