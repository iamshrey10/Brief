"""Lists the latest questions that ended badly, each with the reference code a person would have been shown.

Run from api/ with: python -m scripts.recent_failures [how many, default 20] [outcome, default failed]

The outcomes are the ones answer traces record: failed, withheld, not_found, nothing_to_search, answered. Newest first.
Holds ids and times only, like the traces themselves. Exit code 0 when it lists something, 1 when there is nothing to list,
2 when an argument is not acceptable.
"""

import asyncio
import sys

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import async_session
from app.models import AnswerTrace
from app.traces import OUTCOMES

MAX_LIMIT = 200


async def run(session: AsyncSession, limit: int = 20, outcome: str = "failed") -> tuple[int, str]:
    if not 1 <= limit <= MAX_LIMIT:
        return 2, f"How many must be from 1 to {MAX_LIMIT}."
    if outcome not in OUTCOMES:
        return 2, f"The outcome must be one of: {', '.join(sorted(OUTCOMES))}."
    rows = (
        await session.execute(
            select(AnswerTrace)
            .where(AnswerTrace.outcome == outcome)
            .order_by(AnswerTrace.created_at.desc())
            .limit(limit)
        )
    ).scalars().all()
    if not rows:
        return 1, f"No {outcome} questions saved."
    lines = [f"{'when (UTC)':19}  {'reference':9}  {'took':>7}  document"]
    for row in rows:
        lines.append(
            f"{row.created_at:%Y-%m-%d %H:%M:%S}  {row.request_id[:8]:9}  {row.elapsed_ms:>5}ms  {row.document_id}"
        )
    return 0, "\n".join(lines)


async def main(argv: list[str]) -> int:
    try:
        limit = int(argv[0]) if argv else 20
    except ValueError:
        print("How many must be a number.")
        return 2
    async with async_session() as session:
        code, text = await run(session, limit, argv[1] if len(argv) > 1 else "failed")
    print(text)
    return code


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main(sys.argv[1:])))
