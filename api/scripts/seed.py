"""Drops one known demo document into the database, with real embeddings.

Run from api/ with: python -m scripts.seed

Useful for testing later features (retrieval, chat, extraction) without uploading a
real file through the browser every time. Safe to re-run, it replaces its own demo
document rather than piling up duplicates.
"""

import asyncio

from sqlalchemy import select

from app.db import async_session
from app.ingestion import embed_texts
from app.models import Clause, Document, Embedding, User

DEMO_EMAIL = "demo@brief.local"
DEMO_FILENAME = "demo-education-loan.pdf"

DEMO_CLAUSES = [
    (
        1,
        "The Borrower shall receive disbursement of the full loan principal in a single "
        "payment within five (5) business days of loan approval.",
    ),
    (
        1,
        "Interest accrues at a fixed annual rate of 6.8%, compounded monthly, beginning on "
        "the disbursement date.",
    ),
    (
        2,
        "No prepayment penalty applies. The Borrower may repay all or part of the "
        "outstanding principal at any time without additional fee.",
    ),
    (
        2,
        "A grace period of six (6) months following graduation or separation from "
        "enrollment applies before the first payment is due.",
    ),
    (
        3,
        "In the event of default, defined as non-payment for more than 90 consecutive "
        "days, the entire outstanding balance becomes immediately due.",
    ),
]


async def seed() -> None:
    async with async_session() as session:
        result = await session.execute(select(User).where(User.email == DEMO_EMAIL))
        user = result.scalar_one_or_none()
        if user is None:
            user = User(email=DEMO_EMAIL)
            session.add(user)
            await session.flush()

        existing = await session.execute(
            select(Document).where(
                Document.user_id == user.id, Document.filename == DEMO_FILENAME
            )
        )
        for old_document in existing.scalars().all():
            await session.delete(old_document)
        await session.flush()

        document = Document(
            user_id=user.id,
            filename=DEMO_FILENAME,
            doc_type="loan",
            status="processing",
            storage_key="demo/seed-document.pdf",
            file_size_bytes=0,
        )
        session.add(document)
        await session.flush()

        vectors = embed_texts([text for _page, text in DEMO_CLAUSES])

        for index, ((page_number, text), vector) in enumerate(
            zip(DEMO_CLAUSES, vectors, strict=True)
        ):
            clause = Clause(
                document_id=document.id,
                clause_index=index,
                page_number=page_number,
                char_start=0,
                char_end=len(text),
                text=text,
            )
            session.add(clause)
            await session.flush()
            session.add(Embedding(clause_id=clause.id, vector=vector))

        document.status = "ready"
        await session.commit()

        print(
            f"Seeded document {document.id} for {user.email} with {len(DEMO_CLAUSES)} clauses."
        )


if __name__ == "__main__":
    asyncio.run(seed())
