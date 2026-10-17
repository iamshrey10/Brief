"""Finds what an answer used, from the reference code shown in a failure message.

Run from api/ with: python -m scripts.find_request 3f2b8c1e

The reference is the first eight characters of a request id. This prints every saved trace that starts
with it: when it happened, how it ended, how long it took, and the ids of the clauses the model was shown
and the ones it cited. Search the API log for `[3f2b8c1e` to see the log lines of the same request.
Traces hold ids only, never a question, an answer or any text of a document.

Exit code 0 when something was found, 1 when nothing matched, 2 when the reference is not a reference.
"""

import asyncio
import sys

from sqlalchemy.ext.asyncio import AsyncSession

from app.db import async_session
from app.models import AnswerTrace
from app.traces import find_traces


def describe(trace: AnswerTrace) -> str:
    return "\n".join(
        [
            f"request   {trace.request_id}",
            f"when      {trace.created_at:%Y-%m-%d %H:%M:%S} UTC",
            f"kind      {trace.kind}",
            f"outcome   {trace.outcome}",
            f"took      {trace.elapsed_ms} ms",
            f"person    {trace.user_id}",
            f"document  {trace.document_id}",
            f"clauses   {len(trace.retrieved)} shown, {len(trace.cited)} cited",
            f"shown     {', '.join(trace.retrieved) or '-'}",
            f"cited     {', '.join(trace.cited) or '-'}",
        ]
    )


async def run(reference: str, session: AsyncSession) -> tuple[int, str]:
    """Looks the reference up. Returns the exit code and what to print."""
    try:
        found = await find_traces(session, reference)
    except ValueError:
        return 2, "That is not a reference code: use at least six letters, digits or dashes."
    if not found:
        return 1, f"No trace found for {reference}."
    return 0, "\n\n".join(describe(trace) for trace in found)


async def main(reference: str) -> int:
    async with async_session() as session:
        code, text = await run(reference, session)
    print(text)
    return code


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python -m scripts.find_request <reference code>")
        raise SystemExit(2)
    raise SystemExit(asyncio.run(main(sys.argv[1])))
