import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Clause

# Whole-document tasks (key terms, the checklist) need every clause, not a few retrieved ones,
# because the model has to notice what is absent as well as what is present. A typical contract
# is far below this. Past it the document is cut and the result says so, never silently
# reporting "not mentioned" for text the model never saw.
MAX_PROMPT_CHARS = 300_000


@dataclass
class PromptClauses:
    # the clauses actually sent, in document order
    sent: list[Clause]
    # (label, text) pairs for the prompt: C1, C2, and so on
    labeled: list[tuple[str, str]]
    by_label: dict[str, Clause]
    # True when the document was too long to send in full
    truncated: bool


async def load_prompt_clauses(session: AsyncSession, document_id: uuid.UUID) -> PromptClauses:
    """The document's clauses in order, labeled for a prompt, cut at MAX_PROMPT_CHARS."""
    result = await session.execute(
        select(Clause).where(Clause.document_id == document_id).order_by(Clause.clause_index)
    )
    all_clauses = list(result.scalars())

    sent: list[Clause] = []
    used = 0
    for clause in all_clauses:
        if used + len(clause.text) > MAX_PROMPT_CHARS:
            break
        sent.append(clause)
        used += len(clause.text)

    labeled = [(f"C{position}", clause.text) for position, clause in enumerate(sent, start=1)]
    by_label = {label: clause for (label, _text), clause in zip(labeled, sent, strict=True)}
    return PromptClauses(
        sent=sent, labeled=labeled, by_label=by_label, truncated=len(sent) < len(all_clauses)
    )
