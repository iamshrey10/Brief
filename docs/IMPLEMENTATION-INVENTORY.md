# Brief implementation inventory

A map of what Brief really is, built by reading the code and not the dependency lists. Every row names the file it comes
from, so a claim can be checked. Where something is not in the code, it says so. Written on November 17, 2026, against
`main` at the commit that follows `6ef553c`.

## What Brief does

Brief reads a contract a person uploads (a lease, a loan or a job offer, as a PDF, a scanned PDF, or up to five photos of
the pages) and explains it in plain English. It pulls out the key terms with their exact quotes, lists the questions
people usually forget to ask before signing, and answers questions from the document with the clause it came from. If
the document does not say, it says that instead of guessing. It is explanation, not legal advice.

Live at https://briefcontracts.com. The site is on Vercel, the API on Render, the database on Neon, Redis on Upstash and
files on Cloudflare R2 (see `infra/DEPLOY.md` and `docs/ARCHITECTURE.md`).

## Verified technology stack

### Website (`web/`)

| Part | What | Where it is used |
|---|---|---|
| Framework | Next.js 16.4.6, React 19.2.8, TypeScript | `web/app`, `web/components`, `web/lib` |
| Styling | Tailwind CSS 4, `tw-animate-css`, shadcn tokens, `class-variance-authority` | `web/app/globals.css`, `web/components/ui/button.tsx` |
| Base components | `@base-ui/react` (Button) | `web/components/ui/button.tsx` only |
| Icons | `lucide-react` | 19 files |
| Fonts | `geist`, `@fontsource/fraunces`, served from `node_modules`, never from Google | `web/app/layout.tsx` |
| Theme | `next-themes` (light, dark, system) | `web/components/theme-provider.tsx`, `theme-choice.tsx` |
| Sign in | Auth.js (`next-auth` 5 beta), Google only | `web/auth.ts`, `web/proxy.ts` |
| Tokens | `jose`, a service token that expires in 60 seconds | `web/lib/service-token.ts` |
| Rate limit | `ioredis`, 120 requests a minute per person | `web/lib/rate-limit.ts`, `web/lib/redis-url.ts` |
| Two-step QR code | `qrcode` | `web/components/two-factor-panel.tsx` |
| State | React state and `useSyncExternalStore` for the tour, analytics choice and theme. No state library. | `web/lib/tour-state.ts`, `web/lib/analytics.ts` |
| Data fetching | plain `fetch` to the site's own `/api/backend/*` routes. No data library. | `web/lib/*.ts` |

### API (`api/`)

| Part | What | Where it is used |
|---|---|---|
| Framework | FastAPI 0.143, Uvicorn, Python 3.12, async | `api/app/main.py` (49 route decorators, 47 documented, 2 hidden HEAD routes), `api/Dockerfile` |
| Settings | `pydantic-settings` reading `.env` (which needs `python-dotenv`) | `api/app/config.py` |
| Database layer | SQLAlchemy 2 async with `asyncpg` (and `greenlet`), Alembic migrations | `api/app/models.py`, `api/migrations/versions` (21 files) |
| Vector search | `pgvector` | `api/app/models.py`, `api/app/retrieval.py` |
| Token check | `PyJWT`, HS256, an expiry is required | `api/app/auth.py` |
| File storage | `boto3` against Cloudflare R2 | `api/app/storage.py`, `api/app/bucket_cors.py` |
| PDF text | `pymupdf` | `api/app/pdf_text.py`, `api/app/ingestion.py` |
| OCR | `pytesseract` (Tesseract), `opencv-python-headless` for straightening, `pillow-heif` for iPhone photos | `api/app/image_processing.py` |
| Model | `google-genai`, Gemini | `api/app/qa.py`, `key_terms.py`, `checklist.py`, `ingestion.py` |
| Reranker | `flashrank`, cross-encoder `ms-marco-MiniLM-L-12-v2`, opt-in only | `api/app/reranker.py` |
| Encryption | `cryptography` (Fernet) for two-step secrets | `api/app/two_factor.py` |

### Data and hosting

Postgres with pgvector (Docker image `pgvector/pgvector:pg16` locally), Redis 7 (`docker-compose.yml`), 14 tables, listed
in `docs/ARCHITECTURE.md`: `users`, `documents`, `clauses`, `embeddings`, `extractions`, `checklist_answers`, `usage`,
`activity`, `answer_traces`, `dashboard_shares`, `two_factor`, `recovery_codes`, `trusted_devices`, `site_events`.

## The AI and LLM implementation, as built

There are three kinds of model call, and they all go through one gate (`api/app/model_call.py`) that limits how many run at
once, retries with a time limit, and counts calls against a site-wide daily cap.

| Step | Model | How | File |
|---|---|---|---|
| Embedding clauses and questions | `gemini-embedding-001`, 768 dimensions | batches, waits out the per minute limit and reports progress | `api/app/ingestion.py` |
| Answering a question | `gemini-3.5-flash-lite`, temperature 0, structured JSON (`GroundedAnswer`) | the 8 best clauses are shown with labels like C2 | `api/app/qa.py` |
| Key terms (41 fields across the document kinds) | same model, temperature 0, structured JSON, read 3 times with seeds 1 to 3 and kept by majority vote | `api/app/key_terms.py`, `consensus.py`, `key_term_fields.py` |
| "Before you sign" questions (36 questions) | same model, read 3 times, then checked by a second "judge" call | `api/app/checklist.py`, `checklist_questions.py` |

How a question is answered (`api/app/qa.py`, `api/app/retrieval.py`):

1. The question is embedded.
2. Two searches run: Postgres full-text search (`ts_rank` over a `search_vector` column) and pgvector cosine distance.
3. The two result lists are merged by reciprocal rank fusion (`RRF_K = 60`), and the top 8 clauses are kept.
4. One Gemini call returns structured JSON: `found`, `answer`, and citations (a clause label and a quote).
5. Each quote is checked word for word against its clause (`api/app/grounding.py`). A quote that is not really in the
   clause is thrown away. Every number in a key term must also appear in its quote.
6. If nothing survives, the person is told the document does not seem to cover it.
7. A trace of what was used (ids only, never text) is saved for 30 days (`api/app/traces.py`).

The system instruction tells the model to treat the clauses as data and never as instructions
(`SYSTEM_INSTRUCTION` in `api/app/qa.py`).

What is **not** in the code, so it must not be claimed: there is no tool or function calling, no multi-step agent loop and
no "eval API". Brief is retrieval plus one grounded generation plus a verification step. The cross-encoder reranker exists
but is off by default (`SearchRequest.rerank = False`), because on the retrieval evaluation it lowered top-1 accuracy from
96 to 67 percent (see `evals/results/retrieval-2026-10-01.md`). The `/ask` route always uses the hybrid search.

Recorded evaluation results live in `evals/results/` and are checked in CI against `evals/thresholds.json`. For example
`evals/results/qa-2026-10-27.md`: 32 of 32 answerable questions cited the right clause and 18 of 18 unanswerable ones were
correctly declined, on a 17 clause fixture, with the real model. Those are results on small fixtures that were written by
hand. They are not a claim about all contracts.

## Features and their source files

| Feature | Main files |
|---|---|
| Upload (PDF, JPG, PNG, HEIC, up to 50 MB, up to 5 photos as one document) | `web/components/upload-panel.tsx`, `web/lib/photos-pdf.ts`, `api/app/main.py` (`create_upload`, `confirm`), `api/app/storage.py` |
| Reading a document (text, OCR, clauses, embeddings, progress, recovery of stranded reads) | `api/app/ingestion.py`, `image_processing.py`, `clause_segmentation.py`, `pdf_text.py` |
| Overview: key terms with quotes, dates, summary actions | `web/components/overview-panel.tsx`, `summary-actions.tsx`, `api/app/key_terms.py` |
| Before you sign | `web/components/open-questions.tsx`, `api/app/checklist.py` |
| Ask | `web/components/chat-panel.tsx`, `web/lib/ask.ts`, `api/app/qa.py` |
| Summary as text or PDF (built in the browser, share sheet on phones) | `web/lib/pdf.ts`, `summary-text.ts`, `download.ts` |
| Dashboard, documents, folders, search, rename, bin (7 days) | `web/app/dashboard/*`, `web/components/document-list.tsx`, `api/app/filing.py`, `folders.py` |
| Sharing a dashboard for a chosen time, with approval | `web/components/sharing-panel.tsx`, `api/app/sharing.py` |
| Two-step verification (TOTP, recovery codes, trusted device) | `web/components/two-factor-panel.tsx`, `web/lib/two-factor*.ts`, `api/app/two_factor.py` |
| Daily limits, site-wide model cap | `api/app/usage.py`, `api/app/model_call.py` |
| Guided tour | `web/components/guided-tour.tsx`, `web/lib/tour-steps.ts`, `tour-state.ts` |
| Admin page, counts only, with reports | `web/app/dashboard/admin`, `web/components/admin-*.tsx`, `charts.tsx`, `api/app/admin.py` |
| Demo video and its counters | `web/public/demo/`, `web/components/demo-video.tsx` |
| Optional visit counting on the first page, after a yes | `web/lib/analytics.ts`, `web/components/analytics-notice.tsx` |
| Branded 404 page | `web/app/not-found.tsx` |

## Authentication and security

- Google sign in only (`web/auth.ts`). A second, test-only sign in exists only when `E2E_AUTH=true` outside production
  (`web/lib/e2e-auth.ts`, checked by a test).
- The browser never calls the API. Every call goes through `/api/backend/*` routes that check the session, apply the rate
  limit, add a request id, and sign a token that expires in 60 seconds (`web/lib/proxy.ts`, `require-session.ts`).
- The API accepts only that token: signature, HS256, a required expiry, and it refuses weak or default secrets in
  production (`api/app/auth.py`, `config.py`). Every query is scoped to the person.
- Files go straight to private storage by a 5 minute link. The real size and first bytes are checked after upload
  (`api/app/storage.py`).
- Security headers and a report-only content policy (`web/lib/security-headers.ts`).
- Logs carry fixed messages and ids, never document text, and a test reads every logging call.
- Dependency audits run on every push and weekly (`.github/workflows/audit.yml`).

## Testing and CI

| Layer | Tool | Where |
|---|---|---|
| API | pytest, pytest-asyncio, httpx, coverage floor 99 percent | `api/tests/` (54 test files), `api/.coveragerc` |
| Web unit and component | Vitest, Testing Library, coverage floor in `web/vitest.config.mts` | 156 `*.test.ts(x)` files |
| Browser | Playwright with axe accessibility scans, against a fake API that checks tokens like the real one | `web/e2e/` (39 spec files) |
| Evaluations | real Gemini, recorded results, thresholds checked in CI | `evals/` |

CI (`.github/workflows/ci.yml`): web lint, unit tests with coverage and build; browser tests; API ruff, import check,
migrations, pytest with coverage, eval threshold check, and a commit-message check. `audit.yml` runs the dependency audits.
Main is protected: seven checks must pass and changes go in by pull request. Render deploys the API after CI; Vercel
deploys the website.

## Repository layout

```
api/            FastAPI service, Alembic migrations, tests, operational scripts
web/            Next.js website, unit tests, Playwright tests, demo video
evals/          model evaluations, fixtures, recorded results, thresholds
docs/           ARCHITECTURE, DEMO, DESIGN-HISTORY, MANUAL-TEST, PRIVACY-REVIEW, this inventory
infra/          DEPLOY.md checklist
scripts/        check-all.sh, check-commit-messages.sh, install-hooks.sh
.github/        CI, dependency audit, Dependabot (alerts only)
```

## Problems found in the existing documentation during this audit

These were wrong or stale compared with the code and were corrected in the same change:

1. `api/README.md` listed "agentic tool calling, eval API". Neither exists in the code.
2. `docs/ARCHITECTURE.md` said the website rate limit is 30 calls a minute. It is 120 (`web/lib/rate-limit.ts`).
3. `docs/ARCHITECTURE.md` said the list refreshes every 3 seconds while a document is processing. It is 5 seconds
   (`POLL_INTERVAL_MS` in `web/lib/documents.ts`).
4. `web/README.md` said the browser tests are 88 tests. The count is far higher now.
5. `STATUS.md` test counts were from November 13. They were refreshed from a real run on November 17.

## Left alone on purpose

- Open remote branches, none deleted (the rule is never to delete remote branches). There are many old merged branches
  that can be deleted from GitHub when convenient.
- `api/scripts/*` (`seed.py`, `find_request.py`, `recent_failures.py`, `set_bucket_cors.py`): operational tools used by
  `infra/DEPLOY.md` and `docs/ARCHITECTURE.md`, and covered by tests.
- `evals/results/*`: recorded results that CI compares with `thresholds.json`.
- `web/public/demo/brief-demo.mp4` (8 MB): the demo video the site plays.
