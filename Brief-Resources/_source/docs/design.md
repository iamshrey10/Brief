title: System Design
---
## Introduction

This document describes why Brief is designed the way it is: what it must do, what constraints shape it, how its parts are arranged, and where its limits are. It is written from the source code and the live deployment as of November 17, 2026. The picture of the parts is in *Brief-System-Architecture.pdf*, and the path of one request is in *Brief-Architecture-Explanation.pdf*. The language model is covered in more detail in *Brief-AI-LLM-Documentation.pdf*.

Where a statement is a measurement, it names its source. Where it is an analysis or a suggestion, it says so.

## Problem statement

A person about to sign a lease, a loan or a job offer needs to understand it, and the people best placed to help are expensive or unavailable. A general-purpose chatbot is not a safe substitute, because it produces fluent text with nothing to check it against, and in a contract a single invented figure matters. The design problem is to **use a language model to explain a private document in a way the reader can verify, at a cost that stays bounded, while keeping the document private**.

## Functional requirements

| # | Requirement | Where it is met |
|---|---|---|
| F1 | A person signs in without a password | Google sign-in (Auth.js) |
| F2 | Accept a PDF, a scan, or up to five photos, up to 50 MB, and keep up to 25 documents | Upload flow, `storage.py`, `main.py` |
| F3 | Read a document into numbered clauses, including by OCR | `ingestion.py`, `image_processing.py`, `clause_segmentation.py` |
| F4 | Show the key terms of a lease, loan or job offer, each with its quote | `key_terms.py` |
| F5 | List the questions people forget to ask, answered from the document or marked as not covered | `checklist.py` |
| F6 | Answer a question in plain words, citing the clause, or say the document does not cover it | `qa.py`, `retrieval.py` |
| F7 | Let a person take the summary away: copy, PDF, calendar, email, print | `summary-actions.tsx` and the files it uses |
| F8 | Show a dashboard, a document list with folders and search, and a 7-day Bin | `app/dashboard/`, `filing.py`, `housekeeping.py` |
| F9 | Share a dashboard read-only for a chosen time, with approval, and take it back | `sharing.py` |
| F10 | Offer optional two-step verification | `two_factor.py` |
| F11 | Show the owner usage as counts only, with downloadable reports | `admin.py` |
| F12 | Let a person delete a document, or the whole account, and everything read from it | `main.py` delete routes |

## Non-functional requirements

| Quality | What the design requires |
|---|---|
| **Truthfulness** | Nothing is shown that cannot be traced to a quote in the document. A quote that is not really in its clause is discarded. |
| **Privacy** | The browser reaches only the website; the API trusts only a short-lived signed token; files are private; logs and the admin page never hold content. |
| **Bounded cost** | Per-person daily limits (40 questions, 10 reads, 20 overviews) and a site-wide daily cap on model calls (3,000 by default). |
| **Reliability** | A restart must not lose a document that was being read; a provider hiccup must be retried within a limit; the system must say plainly when it cannot do something. |
| **Accessibility and usability** | Every main screen passes an automated accessibility scan in light and dark mode, works with a keyboard, respects reduced motion, and fits a phone. |
| **Maintainability** | Every change is tested before it merges; settings live in the environment; the database changes only by versioned migrations. |
| **Honesty about limits** | The product says it is not legal advice, and says "not covered" instead of guessing. |

## High-level design

Brief is a three-tier system with a model on the side. The **website** is a Next.js application on Vercel. It serves the pages, handles sign-in and is the browser's only route to the API. The **API** is a FastAPI application on Render. It owns the rules, the reading of documents and every call to the model. The **data tier** is Postgres with pgvector (Neon) for structured data, vectors and text search, a private R2 bucket for files, and Redis (Upstash) for a short rate-limit counter. Google's Gemini is the model.

Three decisions shape the arrangement:

1. **One door.** The browser never calls the API. The website checks the session and the rate limit and signs a token that lasts 60 seconds. This keeps the API's secret away from the browser and the API free of browser-facing settings.
2. **Files go around the API.** The browser uploads straight to storage by a 5 minute link, so file bytes never pass through the API, and the API checks the real file afterwards.
3. **Reading is slow, so it is a background task.** A document takes seconds to minutes to read, so the request answers at once and the page shows progress.

![wide: The system design flow, from a person's first action to the result, with the data touched and whether AI is used at each step.](Brief-System-Design-Flow.png)

## Low-level design

The key algorithms and where they live:

- **Reading a document** (`ingestion.py`). Download the file; for each page take the text layer (PyMuPDF), and if a page has fewer than 20 characters, render it at 200 dpi and run OCR (Tesseract, after straightening with OpenCV, with images limited to 3,000 pixels on the long side). Split each page into clauses with `segment_page_into_clauses`: it recognises numbering such as `1.`, `1.1`, `(a)`, `Section 2` and falls back to chunks of about 1,500 characters when there is too little structure to trust, and re-splits a "clause" longer than 3,000 characters. Embed the clauses in batches of 100 and save the progress after each batch. Mark the document ready, or "needs retake" when the average OCR word confidence is under 60.
- **One document at a time for each person** (`_one_read_at_a_time`). A person who uploads a pile of files cannot take the whole model allowance, because their documents are read in turn. Others are not held up.
- **Recovery** (`recover_stranded_reads`). A little after the server starts, documents left "uploaded" or "processing" with nothing working on them are read again.
- **Hybrid search** (`retrieval.py`). Run a Postgres full-text query (`plainto_tsquery`, `ts_rank`) and a pgvector nearest-neighbour query (cosine distance) on one document, merge the two ranked lists by reciprocal rank fusion (constant 60), and keep the best clauses (8 for an answer).
- **The quote check** (`grounding.py`). A quote counts only if, ignoring case and spacing, it appears inside the clause it names. For a key term, every number in the value must also appear in its quotes (thousands separators ignored).
- **Three reads and a vote** (`consensus.py`). A key term or an answer is kept only if more than half of the reads found it, and the entry returned is the one most other positive reads agree with.
- **The judge** (`checklist.py`). Each answer to a question is shown, alone, to a separate model call that decides whether the quoted text states what was asked. It is asked twice, and a third time only if the two disagree.
- **The model gate** (`model_call.py`). At most 12 model calls run at once (2 for questions), calls are spaced under a per-minute allowance (300, with 60 kept for questions), a refused or busy call is retried with a wait (up to 3 retries and a total wait of 50 seconds), and every call is counted toward a site-wide daily cap.

## Main system components

| Component | Responsibility | Source |
|---|---|---|
| Website pages | Show the interface; server-render the first view | `web/app/`, `web/components/` |
| Backend routes | Session check, rate limit, request id, token | `web/lib/proxy.ts`, `require-session.ts`, `service-token.ts` |
| Sign-in guard | Keep signed-out visitors out; enforce the two-step check | `web/auth.ts`, `web/proxy.ts` |
| API routes | Validate input, check ownership and limits, call the modules | `api/app/main.py` |
| Reading pipeline | Turn a file into clauses and vectors | `ingestion.py` and its helpers |
| Retrieval and answering | Search, ask the model, check the quotes | `retrieval.py`, `qa.py`, `grounding.py` |
| Overview generation | Key terms and questions, read three times and voted | `key_terms.py`, `checklist.py`, `consensus.py` |
| Limits | Daily counts, the site cap, pacing of model calls | `usage.py`, `model_call.py` |
| Sharing and two-step | Time-limited read-only access; the second lock | `sharing.py`, `two_factor.py` |
| Housekeeping | Empty the Bin, remove abandoned uploads and old traces | `housekeeping.py` |
| Admin counts | Counts only, with reports | `admin.py` |

## Database design

Fourteen tables, created by 21 Alembic migrations. `api/app/models.py` is the source of truth.

| Table | A row is | Key columns |
|---|---|---|
| `users` | A signed-in person | `email` (unique), first and last name, sign-up reason |
| `documents` | An upload | `user_id`, `filename`, `doc_type`, `status`, `storage_key`, `folder`, `deleted_at`, `failure_reason`, progress, `ocr_confidence` |
| `clauses` | One numbered clause | `document_id`, `clause_index`, `page_number`, `char_start`, `char_end`, `text`, `search_vector` (GIN index) |
| `embeddings` | The meaning vector of a clause | `clause_id`, `vector` (768 numbers, pgvector) |
| `extractions` | One key term of a document | `document_id`, `clause_id`, `field_name`, `value`, `quote`, `evidence` (JSON) |
| `checklist_answers` | One question to ask, answered or marked a gap | `document_id`, `question_id`, `answer`, `evidence` |
| `usage` | Uses of one kind by one person on one day | `user_id`, `day`, `kind`, `count` |
| `activity` | Time and visits by one person on one day | `user_id`, `day`, `seconds`, `visits` |
| `answer_traces` | How one question was answered | `user_id`, `document_id`, `request_id`, `outcome`, ids of clauses retrieved and cited, `elapsed_ms` (no text) |
| `dashboard_shares` | An invitation to see a dashboard | `owner_id`, `viewer_id`, `token_hash`, `code_hash`, `status`, expiry and access times |
| `two_factor`, `recovery_codes`, `trusted_devices` | The second lock | The secret encrypted with Fernet; codes and device tokens as hashes |
| `site_events` | A counter by day for the demo video | `day`, `name`, `count` |

**Relationships.** `users` 1 to many `documents`; `documents` 1 to many `clauses`; `clauses` 1 to 1 `embeddings`; `documents` 1 to many `extractions` and `checklist_answers`; `extractions` point to the `clauses` of their main quote. Several tables hold a foreign key to `users`, and deleting an account removes the person's rows and files.

**Order of deletion.** Deleting a document removes its stored file first and then its rows, one document at a time, and an account's deletion removes the person's documents and then the account, so a failure part way leaves something that can be tried again.

**Consistency.** The first row for a person is created with an insert that does nothing on conflict, because a first page makes several requests at once. A repeated confirm of an upload is refused.

## API design

The API has 49 route handlers, of which 47 are documented (two are hidden HEAD versions of the health routes). Each has a group, a plain summary, a description and the error answers it can give, and a test fails if one is added without them. In production the interactive documentation is not served.

| Group | Examples | Purpose |
|---|---|---|
| health | `GET /health`, `/health/db`, `/health/ready` | Is it up, can it reach the database, is it ready for traffic |
| account | `GET /me`, `PATCH /me`, `GET /me/usage`, `GET /me/insights`, the `/me/2fa/*` routes, `DELETE /me` | The person, their limits, their dashboard numbers, two-step, deletion |
| documents | `POST /documents`, `PATCH .../confirm`, `GET /documents`, `GET /documents/{id}`, `PATCH`, `DELETE`, `/trash`, `/restore`, `/permanent`, `/move`, `/file`, `/retry`, `/reread` | The life of a document |
| answers | `GET .../key-terms`, `GET .../checklist`, `POST .../ask`, `POST .../search` | Reading a document to a person |
| sharing | `POST /shares`, `GET /shares`, `/approve`, `/join`, `GET /shared`, `/shared/{id}/dashboard` | Time-limited read-only access |
| admin and events | `GET /admin/stats`, `GET /admin/report`, `POST /events/{name}` | Counts only |

**Conventions.** JSON in and out. Errors use FastAPI's `detail` field with a status: 400 for a refused input, 401 for a missing or bad token, 404 for "not found" (also used for someone else's document), 409 for a document in the wrong state, 429 for a limit with a "Retry-After" header, and 502 when the model or storage failed. `POST /documents/{id}/search` exists for retrieval testing; the website does not call it.

## Authentication design

- **Signing in.** Google sign-in through Auth.js. `prompt: select_account` makes Google ask which account each time, so a signed-out browser does not sign straight back in.
- **The service token.** The website signs a JWT with the shared secret using HS256, with the person's email as the subject and a 60 second expiry (`jose`). The API verifies the signature, the algorithm and that an expiry is present (`PyJWT`), and then finds or creates the person by email.
- **Authorization.** Every query is scoped to the person. Someone else's document answers "not found", not "forbidden", so its existence is not revealed. The admin page is available only to the accounts in `ADMIN_EMAILS`, and answers as if it did not exist for everyone else.
- **Two-step verification.** TOTP (6 digits, 30 second steps, one step of tolerance). Ten recovery codes are shown once and stored hashed. Five wrong codes lock the check for 15 minutes. A browser can be trusted for 30 days (up to 10 devices). A signed cookie tells `proxy.ts` that the check has been passed, and the secret is stored encrypted.
- **Sharing.** An invitation has a link and a six-digit code, both stored only as hashes. The invited person must sign in, open the link and enter the code (three wrong codes stop it), and the owner must approve before anything is visible. Access lasts the time chosen (1 hour to 90 days) and can be removed at any time. Up to 5 people.
- **The visitor token.** The public demo video's counters use a separate token whose subject is `site-visitor`, which the API accepts on that route only.

## AI and LLM design

Language models are used in exactly three places, all from the API, and everything around them is ordinary code. The details are in the AI and LLM document. In short:

- **Reading:** `gemini-embedding-001` makes a 768-number vector for each clause.
- **Asking:** the question is embedded, two searches find the best 8 clauses, and `gemini-3.5-flash-lite` returns one structured answer with quotes, which code then checks.
- **Key terms and questions to ask:** the same model reads the document three times, code checks and votes, and a judge call confirms each answer to a question.

The model is told, in a fixed system instruction, that clauses are data and never instructions, that it must answer only from them, and that it must say "not found" rather than guess. The design does not depend on the model obeying: the quote check and the number check decide what is shown. There is no tool calling, no agent loop and no fine-tuning.

## Data flow

The data that leaves Brief is limited. **Google's Gemini service** receives clause text and the question, as text; the file itself is never sent. **Google** receives the sign-in, and receives visit counts only if the visitor said yes. **Upstash** holds a short counter with the email. **Neon** and **Cloudflare** hold the data and files, as the host of Brief's own storage.

![wide: The data flow: what travels between the parts, and where each kind of data is kept.](Brief-Data-Flow-Diagram.png)

## Security considerations

| Concern | Control | Where |
|---|---|---|
| Someone reading another person's document | Every query is scoped to the person in the token; others answer "not found" | `main.py`, tests |
| A forged or stale token | Signed HS256, required expiry of 60 seconds | `auth.py`, `service-token.ts` |
| A weak secret in production | The server refuses to start | `config.py` |
| A hostile file (wrong type, too big, not what it claims) | Size and first bytes are read from storage; the file is deleted and refused | `storage.py`, `main.py` |
| A document that tries to give the model orders (prompt injection) | The instruction says clauses are data to read; every output is checked by code; nothing the model says is acted on | `qa.py`, `grounding.py` |
| An invented figure | Every number in a key term must be in its quote | `grounding.py` |
| Flooding | Per-person rate limit in the website; daily limits and a site cap in the API | `rate-limit.ts`, `usage.py` |
| Guessing a two-step or a share code | Lockouts (5 wrong codes for 15 minutes; 3 wrong share codes); the rate counter fails closed for two-step | `two_factor.py`, `sharing.py`, `rate-limit.ts` |
| Leaking content through logs | Fixed log messages and ids; a test reads every logging call | `logging_setup.py`, tests |
| Browser attacks | HSTS, `X-Frame-Options: DENY`, nosniff, referrer policy, and a content policy in report-only mode | `security-headers.ts` |
| Vulnerable dependencies | `pnpm audit` and `pip-audit` on every push and weekly | `audit.yml` |
| A secret in the code | None is committed; settings come from the environment; example files hold no values | `.gitignore`, `.env.example` |

## Error handling

- **Reading failures** are classified into a short list so the message is plain: unreadable file, too long (over 100 pages), storage, rate limit, daily limit, service error, no text, or unknown. A document that fails says why and can be tried again.
- **Model failures.** A refused call is retried with a wait; if it cannot succeed within about 50 seconds the person is told to try again, with a reference code.
- **Reference codes.** The request id is shown on a failure, and `find_request.py` finds the matching log lines.
- **Fail open and fail closed.** If Redis cannot be reached the ordinary rate limit lets requests through (the API still checks the session and keeps its own limits); for two-step codes the same failure refuses the request. A key term or answer that fails a check becomes "not mentioned" or "not covered", never a wrong answer.
- **No content in errors.** Error text, logs and traces never contain a document, a question or an answer.

## Performance considerations

- **Reading is the slow step.** Embedding is done in batches of 100, progress is saved after each batch, and a long OCR job runs off the event loop so other requests are not frozen. The per-document call count is about twenty, which is why the pace of calls is controlled.
- **Questions are one model call.** On the recorded question-answering run (the lease and loan fixture), the mean was 4.0 seconds per question and the slowest 46.4 seconds, including waiting out a rate limit (evals/results/qa-2026-10-27.md).
- **Overviews are computed once** and saved, so opening one again costs no model calls.
- **The website** builds the first view on the server, polls the document list only while a document is being read (every 5 seconds), and does the summary PDF, calendar file, find and photo combining in the browser.
- **Measured, not guessed.** Every model call is timed and logged by kind. No load test has been run, so there is no throughput number in this document.

## Scalability

This section is an analysis of the current design, not a measurement.

- **Today** one API container serves everyone. Reading runs inside that process, the per-person "one document at a time" lock and the per-minute pacing of model calls are kept in that process's memory, and the website's Redis holds only a rate counter.
- **To about 10,000 people** the likely first limits are the model allowance and the database. Raising the allowance and the site cap is configuration (`MODEL_CALLS_PER_MINUTE`, `GLOBAL_DAILY_MODEL_CALLS`), and Neon can be scaled up. Reading would compete with answering for the one container's CPU, mainly the OCR.
- **To 100,000 people** reading should move to a separate worker pool fed by a queue, because the in-memory turn-taking and pacing do not coordinate across several API instances (each instance would allow its own full pace). The pacing and the daily cap would need to live in a shared store such as Redis. Embedding and answers could be cached, and the database would need read replicas or partitioning by document.
- **What would become the bottleneck** first: the Gemini rate allowance, then OCR CPU on the API container, then the database for vector search on many large documents.
- **Caching** is already used for the overview (saved after the first build). Answers are not cached, because a question is rarely the same twice.

## Reliability

- **Restart safety.** A document being read when the server restarts is found and read again by the recovery task.
- **Retries within limits.** Model calls are retried with a wait and a ceiling; storage and database errors fail visibly and can be retried by the person.
- **Idempotent steps.** A repeated confirm of an upload is refused, and a re-read replaces what was read before.
- **Safe deletion order.** The file goes first, then the rows, so a failure leaves a state that can be finished.
- **Readiness.** `/health/ready` says whether the server can do real work, and UptimeRobot checks it every 5 minutes.
- **Migrations are a separate step** run once per release; the server's readiness check refuses traffic on a mismatched schema.
- **Not in place:** automated database backups and a tested restore, a staging site, and automatic rollback (listed in `infra/DEPLOY.md` as not set up).

## Current limitations

- It explains; it is not legal advice, and a wrong or missing answer is still possible. The recorded results are from a small number of hand-labelled documents, and the education loan fixture had the weakest result (see the Project Summary).
- The text of a document goes to Google's Gemini service. Brief uses the paid API, but a person should read Google's current terms before uploading something sensitive.
- Only English is configured for text search, and OCR uses Tesseract's default language.
- A document over 100 pages fails; a document's text sent to the model is capped (300,000 characters), and a notice says when part of a very long document was left out.
- Reading runs in the API process, with no separate queue.
- There are no database backups, no staging site, and no automatic rollback.
- The content security policy is in report-only mode, and the site has no audit trail of who opened what.
- The documents are PDFs from strangers parsed by a library; isolating that step in a separate process would reduce risk further.

## Future improvements

These are suggestions that follow from the limits above, not commitments.

1. Database backups with a tested restore, then a staging site and an automatic post-deploy check.
2. Move reading to a queue and a worker pool, and share the model pacing and the daily cap through Redis.
3. More labelled documents for the evaluations, especially loans, and a recorded result for every document kind.
4. Re-test the reranker on longer documents, where a wider shortlist might help.
5. Enforce the content security policy after a period in report-only mode.
6. Run the PDF parser in an isolated process.
7. Add languages beyond English for text search and OCR.
