# Brief

Every clause, explained.

Brief reads a high stakes contract, an education loan, a lease, a job offer, and explains it in
plain English before you sign it. Ask it a question and it answers from the exact clause, with
the quote as proof. If the answer isn't in the document, it says so instead of guessing. It also
pulls out the terms that actually cost you money, and flagging anything unusual is next.

Status: in active development. [STATUS.md](STATUS.md) has the honest picture: what works today,
what is left, the numbers, and the expected finish. It is refreshed every week.

## Why this exists

Coming soon.

## How an answer is checked

An answer is only shown if its evidence holds up.

1. Your question finds the most relevant clauses, using keyword and meaning-based search together.
2. The model is told to answer from those clauses only, and to quote the passage it relied on.
3. Brief checks that each quote really appears in the clause it names, word for word. A quote that
   does not is thrown away.
4. If nothing survives the check, you get "I couldn't find this in the document" and no guess.

The text of an uploaded contract is treated as text to read, never as instructions to follow. Key
terms such as the interest rate or the late fee go through the same checks, and every number in a
term must also appear in its quote.

The key terms and the "Before you sign" questions are each read three times with fixed seeds and
kept by vote: a term or answer stays only if most of the reads found it. The same contract read twice
by a model can come out differently, and this makes the result steadier. The second check on the
questions judges each answer on its own, with two seeded looks and a third only if they disagree. When
it judged the answers together instead, its verdict on one depended on which others were in the group.
On one real 36 clause lease, four unseeded reads of the key terms changed four fields between runs and
four voted reads changed none, and six runs of the questions gave the same two answers every time,
including the $3,498 deposit. Steadier is not the same as more accurate, and this is one lease, so it is
a check and not a claim about contracts in general. The cost is time: a document now makes about ten
or more model calls, three for the key terms, three for the questions, and two or three for each
answer that is checked, so reading one can take from a few seconds to about a minute on the free tier.

Search and answers are measured, not assumed. The reports in [evals/](evals/) show the scores and
where they fall short.

## Architecture

```mermaid
flowchart LR
    Browser["Browser"]
    Web["Next.js (Auth.js, BFF)"]
    API["FastAPI"]
    DB[("Postgres + pgvector")]
    Redis[("Redis")]
    R2[("Cloudflare R2")]
    Gemini["Gemini API"]

    Browser -- session --> Web
    Web -- per-user rate limit --> Redis
    Web -- signed service token --> API
    API -- users, documents, clauses, embeddings, key terms --> DB
    API -- upload / download files --> R2
    API -- embeddings, answers, key terms --> Gemini
```

The frontend is a Next.js app that handles Google sign-in and acts as a thin
backend-for-frontend, it never talks to Postgres or R2 directly. For each request it checks the
session, applies a per-user rate limit through Redis, then mints a short-lived signed token and
calls the FastAPI service. FastAPI owns everything else: user lookup, document storage in R2,
the ingestion pipeline (text extraction, or cleanup and OCR for photos, then splitting into clauses
and embedding them), hybrid search, grounded answers, and key-term extraction, all backed by
Postgres.

## Limits and what a failed read says

Every page costs a reading call on a metered service, so there are limits: 50 MB a file, 25
documents a person (delete one to make room), and 100 pages a document. A refused file is turned away
before any page is read.

When a read fails, the document says why and what to do about it: no text found, a file that cannot
be opened (damaged or password protected), too many pages, a file that could not be fetched, the
reading service being busy, or the day's reading limit being reached. While a long document is being
read, its row shows how many parts are done so far.

## Running locally

You will need Docker, Python 3.12, Node 22 with pnpm, and Tesseract for reading photos of pages
(`brew install tesseract` on a Mac, `sudo apt-get install tesseract-ocr` on Ubuntu).

Start the shared services:

    docker compose up -d

This starts Postgres, with pgvector, and Redis.

Backend (from `api/`):

    python3.12 -m venv .venv
    source .venv/bin/activate
    pip install -r requirements-dev.txt
    alembic upgrade head
    uvicorn app.main:app --reload

Copy `api/.env.example` to `api/.env` first and fill in the real values (R2 credentials,
a Gemini API key, a JWT secret).

Run the backend test suite (from `api/`, with the venv active and Postgres running):

    python -m pytest

Frontend (from `web/`): create `web/.env.local` with these variables, then start it.

    AUTH_SECRET=         # any long random string, for example from: openssl rand -base64 32
    AUTH_GOOGLE_ID=      # Google OAuth client ID
    AUTH_GOOGLE_SECRET=  # Google OAuth client secret
    SERVICE_JWT_SECRET=  # must match SERVICE_JWT_SECRET in api/.env
    BACKEND_URL=http://localhost:8000
    REDIS_URL=redis://localhost:6379

The Google OAuth client needs `http://localhost:3000/api/auth/callback/google` as an authorized
redirect URI.

    pnpm install
    pnpm dev

Frontend checks: `pnpm lint`, `pnpm test`, and `pnpm build`.

The evaluations call the real Gemini API and need Postgres running. Each one is a single command,
see [evals/README.md](evals/README.md).

## License

MIT
