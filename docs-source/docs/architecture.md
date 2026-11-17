title: System Architecture
---
## Purpose and scope

This document describes the architecture of Brief as it is built and deployed on November 17, 2026: which parts exist, where each one runs, and how they communicate. It is the reference for the diagram *Brief-Final-System-Architecture.png*, which is included on the next page and also provided as a separate image file. The step-by-step journey of a request is told in plain English in *Brief-Architecture-Explanation.pdf*, and the reasons behind the design are in *Brief-System-Design.pdf*.

Everything here was checked against the source code (`web/`, `api/`, `infra/DEPLOY.md`) and the live deployment. Where something is not part of the architecture, section 8 says so.

![wide: Brief: final system architecture. The numbers on the arrows are explained in section 4.](Brief-Final-System-Architecture.png)

## The components

| Component | What it is | Runs on | Built with | Its main job |
|---|---|---|---|---|
| Person and browser | The visitor and their phone or laptop | The visitor's device | HTML, CSS, JavaScript, React | Shows the pages, runs the interface, and sends a chosen file straight to storage |
| Website | The Next.js application | Vercel | Next.js 16, React 19, TypeScript | Serves the pages, handles sign-in and sessions, and is the browser's only route to the API |
| Sign-in and session | Google sign-in through Auth.js, and the `proxy.ts` guard | Inside the website | next-auth 5, jose | Proves who the person is and keeps signed-out visitors out of `/dashboard` |
| Backend routes | The `/api/backend/*` handlers in the website | Inside the website | Next.js route handlers | Checks the session and rate limit, adds a request id, signs a 60 second token and forwards the call |
| API | The FastAPI application | A Docker container on Render | Python 3.12, FastAPI | Owns storage, reading documents, search, the model calls and the rules |
| Reading pipeline | The code that turns a file into clauses | Inside the API, as a background task | PyMuPDF, Tesseract, OpenCV | Extracts text, splits it into clauses, builds the index |
| Answering and extraction | Search, model calls and verification | Inside the API | SQLAlchemy, pgvector, google-genai | Answers questions, finds key terms and the questions to ask, and checks every quote |
| Rules and limits | Daily limits, the site-wide cap, sharing, two-step, admin counts, clean-up | Inside the API | Python | Keeps cost bounded and access controlled |
| Database | Postgres with pgvector | Neon | Postgres | Keeps people, documents, clauses, vectors, key terms and counts (14 tables) |
| Rate-limit store | A Redis | Upstash | Redis | Keeps a short counter, with the email, for the per-person rate limit |
| File storage | A private S3-compatible bucket | Cloudflare R2 | R2 | Keeps the uploaded files |
| Language model | Google's Gemini API | Google | gemini-3.5-flash-lite, gemini-embedding-001 | Writes answers and key terms, judges answers, and makes the meaning vectors |
| Google sign-in | Google's OAuth service | Google | OAuth 2 | Tells the website who has signed in |
| Google Analytics | An optional visit counter | Google | gtag | Counts visits to the first page, only after a visitor says yes |
| UptimeRobot | An uptime monitor | UptimeRobot's service | n/a | Checks the website and the API's `/health/ready` every 5 minutes and emails on a failure |

## How the components communicate

The numbers match the arrows in the diagram.

| # | From and to | Protocol and what travels | How it is protected |
|---|---|---|---|
| 1 | Person to browser | A touch or a click | n/a |
| 2 | Browser to website | HTTPS: page requests, and `fetch` calls to `/api/backend/*` with JSON | The session cookie; HTTPS only (HSTS) |
| 3 | Browser to Google sign-in | A redirect to accounts.google.com | Google's own sign-in |
| 4 | Google to website | A redirect back to `/api/auth/callback/google` with a code, which Auth.js exchanges | The redirect address must be registered with Google |
| 5 | Browser to Google Analytics | The gtag script and its reports | Loads only on the first page, only after a yes, with shortened addresses and advertising features off |
| 6 | Browser to R2 | An HTTP PUT of the file to a link the API made | The link works for 5 minutes and for one file; the bucket's CORS rule allows only a PUT from the site's own addresses |
| 7 | Website to Redis | `INCR` and `EXPIRE` on a counter named for the person and the minute | The connection string is a secret in the website's environment |
| 8 | Website to API | HTTPS with `Authorization: Bearer <token>` and `X-Request-ID` | The token is signed (HS256) with a secret both sides hold and expires after 60 seconds |
| 9 | API to Postgres | SQL through an async driver | The database address is a secret; every query is scoped to the person |
| 10 | API to Gemini | The Gemini API: clause text and the question as text, and structured JSON back | The API key is a secret; the file is never sent |
| 11 | API to R2 | The storage API: make an upload link, read a file's size and first bytes, read the file, delete it | The R2 keys are secrets in the API's environment |
| 12 | UptimeRobot to the site and the API | An HTTP request every 5 minutes, to the home page and to `/health/ready` | The health answer carries no private data |

## Boundaries and trust

Brief is built so that each part trusts as little as possible.

- **The browser is not trusted.** It can only reach the website. A file type and size are checked in the browser for convenience, and checked again by the API against what is really in storage.
- **The website trusts the session.** It signs a token only for a person it has just checked, and the token lasts 60 seconds. The browser never holds the signing secret.
- **The API trusts only that token.** It checks the signature, the algorithm and the expiry, and refuses anything else. The browser never calls the API, so the API has no cross-origin (CORS) settings at all.
- **Storage is private.** There are no public file addresses. A file can be reached only by a 5 minute link, or by the API.
- **The model sees only text, and treats it as data.** Its instruction says the clauses are text to read and never instructions to follow.
- **Counts are not content.** The admin page, the activity table and the demo video counter hold numbers by day. The logs hold fixed messages and ids and never the text of a document, a question or an answer.

## Where data lives and for how long

| Data | Where | Kept for | Removed when |
|---|---|---|---|
| The uploaded file | R2 | Until the person deletes the document | The document is deleted for good (a deleted document sits in the Bin for 7 days first) |
| Clauses, vectors, key terms and answers | Postgres | As long as the document | The document is deleted, or read again |
| Name, email, sign-up reason | Postgres | As long as the account | The account is deleted |
| Daily limits, time in Brief, demo video counts | Postgres | Counts by day | The account is deleted (the site-wide counts hold no person) |
| How a question was answered (ids only) | Postgres | 30 days | After 30 days, or with the document or account |
| The email and a request count for rate limiting | Redis | About a minute | It expires by itself |
| A half-finished upload | R2 and Postgres | 1 hour | It is removed when its owner starts the next upload |
| A shared dashboard's link and code | Postgres, as hashes only | Until the time the person chose ends (1 hour to 90 days) | The person removes it, or it expires |
| A trusted browser for two-step | Postgres, hashed | 30 days | It expires, or two-step is turned off |

## Monitoring and logging

What exists:

- **Health checks.** The API answers `GET /health` (the process is up), `GET /health/db` (the database answers) and `GET /health/ready` (200 only when the database answers and its migrations are current, otherwise 503). The website answers `GET /api/health` (200 only when Redis answers).
- **Uptime monitoring.** UptimeRobot checks the website and `/health/ready` every 5 minutes and emails on a failure.
- **Request ids.** Every request gets an id that appears in the API's logs, in the `X-Request-ID` header and in the short reference code a person sees when something fails. `api/scripts/find_request.py` finds a request from its reference code.
- **Structured logs.** With `LOG_FORMAT=json` the API writes one JSON object per line, with the request id and an error named by its type only. Each model call is timed and logged by kind (`embed`, `answer`, `key_terms`, `checklist`, `judge`).
- **Answer traces.** For each question, a row records how it ended (answered, not found, withheld, nothing to search, or failed), how long it took, and the ids of the clauses shown and cited. It holds no text.
- **Usage counts.** The admin page shows counts only.
- **Host dashboards.** Vercel and Render keep their own deploy history and runtime logs.

## Environments

- **Locally**, Docker Compose runs Postgres with pgvector and Redis (`docker-compose.yml`). The website runs with `pnpm dev` and the API with Uvicorn. The browser tests use a fake API that checks tokens the way the real one does.
- **Live**, the website is on Vercel, the API on Render, and the database, Redis and storage are hosted services. All settings come from environment variables, never from the code or the image (`api/.env.example` and `web/.env.example` list them, and a test fails if they drift from what the code reads).
- In production the API **refuses to start** on a built-in secret, a secret under 32 characters, or the development database password. `/docs`, `/redoc` and `/openapi.json` are not served in production.

## What is not part of the architecture

So that nobody assumes otherwise, these do not exist in Brief today:

- **A job queue or separate worker.** Reading a document is a background task inside the API process.
- **A staging environment.** A change goes from a pull request to the live site.
- **A cache layer for answers.** Key terms and questions are saved in the database, but there is no other cache. Redis is used only for the rate limit.
- **Tool calling, an agent, or any model that takes actions.**
- **A log aggregation service.** Logs stay with the hosts.
- **Automated database backups and a tested restore.** These are listed as not set up in `infra/DEPLOY.md`.
