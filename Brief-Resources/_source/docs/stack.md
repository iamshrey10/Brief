title: Technology Stack
---
## Overview

Brief is two programs and a set of services. The **website** (`web/`) is a Next.js application that runs on Vercel. The **API** (`api/`) is a FastAPI application that runs in a Docker container on Render. They are backed by a Postgres database with the pgvector extension (Neon), a private file bucket (Cloudflare R2) and a Redis (Upstash), and the language model is Google's Gemini.

Every technology in this document is used in the code, the build or the live deployment. The tables explain, for each one, what it is and why Brief uses it, where and how it is used, and what it talks to. Versions are the ones in `web/package.json` and `api/requirements.txt` on November 17, 2026.

| Layer | Main technologies | Where it runs |
|---|---|---|
| Website | Next.js 16, React 19, TypeScript, Tailwind CSS 4, Auth.js | Vercel |
| API | Python 3.12, FastAPI, SQLAlchemy 2 (async), Alembic | A Docker container on Render |
| Database | Postgres with pgvector, and Postgres full-text search | Neon |
| Files | A private R2 bucket (S3-compatible) | Cloudflare |
| Counters | Redis, for the per-person rate limit only | Upstash |
| Reading scans and photos | PyMuPDF, Tesseract OCR, OpenCV, pillow-heif | Inside the API container |
| Language model | Google Gemini: gemini-3.5-flash-lite and gemini-embedding-001 | Google's service |
| Sign-in and analytics | Google OAuth; Google Analytics (optional, after a yes) | Google's services |
| Code, checks and delivery | GitHub, GitHub Actions, Vitest, Playwright, pytest, ruff | GitHub's runners |
| Monitoring | UptimeRobot, two checks every 5 minutes | UptimeRobot's service |

![wide: The technology stack, by layer. Arrows show the direction of the main calls.](Brief-Technology-Stack-Diagram.png)

## Frontend

The frontend is the website in `web/`. It is rendered partly on the server and partly in the browser, and it also acts as a thin backend for the browser (see section 3, Backend, and the System Architecture document).

| Technology | What it is, and why Brief uses it | Where and how it is used | Talks to |
|---|---|---|---|
| **Next.js 16.4.6** | A React framework that renders pages on the server and ships a small amount of JavaScript to the browser. Brief uses it for routing, server-side pages, route handlers and sign-in, and because Vercel runs it natively. | `web/app/` holds every page (App Router) and `web/app/api/*` the route handlers. `next.config.ts` sets `output: "standalone"` and the security headers. `proxy.ts` guards `/dashboard`. | The browser; the API (server-side `fetch`); Redis; Google (sign-in) |
| **React 19.2.8** | The library that builds the screens from components. | About 60 components in `web/components/`; client components (`"use client"`) hold interactions such as the chat and the upload panel. | Next.js |
| **TypeScript 5** | JavaScript with types, so mistakes are caught when the code is checked and not when someone uses it. | Every file in `web/` is `.ts` or `.tsx`; `tsc --noEmit` runs in the checks. | n/a |
| **Tailwind CSS 4** | A utility-class styling system. Brief uses it so a component's look sits next to its markup and the design stays consistent. | `app/globals.css` defines the colour tokens (light and dark) and the type; classes are used in every component. | n/a |
| **tw-animate-css** | A small set of animation classes for Tailwind. | Entrance animations such as the page "rise" in `components/rise.tsx` (`animate-in`, `fade-in`, `slide-in-from-bottom`). | Tailwind |
| **shadcn tokens, class-variance-authority, @base-ui/react** | Design-system pieces: shared colour and radius tokens, a helper that builds a component's variants, and an unstyled button primitive. | `components/ui/button.tsx` is the one shared Button, with size and variant options. | React |
| **next-themes** | Handles light, dark and "follow the computer". | `components/theme-provider.tsx`, `theme-choice.tsx`, `theme-toggle.tsx`. | The browser's storage |
| **lucide-react** | An icon set. | Used in about 20 components, for example the tabs and the document row icons. | n/a |
| **Geist and Fraunces fonts** | The sans-serif and serif typefaces. Served from the installed packages, never fetched from Google, so no visitor's browser asks a third party for a font. | `app/layout.tsx` (`next/font/local`, `geist`). | n/a |
| **qrcode** | Draws a QR code. | The two-step setup (`components/two-factor-panel.tsx`) shows the code an authenticator app scans. | n/a |

**State management.** There is no state library. Component state uses React's own hooks, and the few values shared across components (the tour step, the analytics choice, the theme) use `useSyncExternalStore` with a small store in `web/lib/` (for example `tour-state.ts`, `analytics.ts`). Data comes from the API through plain `fetch` calls to the website's own routes, and screens refresh by asking again (the document list every 5 seconds while a document is being read).

**Routing.** Pages follow the folders under `web/app/`: the landing page, `/privacy`, `/terms`, `/dashboard` and its children (`documents`, `shared`, `profile`, `bin`, `admin`, `welcome`), `/shared/join/[token]` and `/two-factor/*`. `proxy.ts` (Next 16's name for middleware) sends a signed-out visitor to the first page and, for someone with two-step verification, to the code check.

**Animations.** Motion is small and always optional. It is made of CSS in `globals.css` (hover lift, press feedback, chart draw-in, the "How it works" scenes), `tw-animate-css` classes, and a few small components (`rise.tsx`, `reveal-on-view.tsx`, `navigation-progress.tsx`). Everything is switched off for a reader who prefers reduced motion.

## Backend

The backend is the API in `api/`. It owns storage, reading documents, search, the language model and the rules.

| Technology | What it is, and why Brief uses it | Where and how it is used | Talks to |
|---|---|---|---|
| **Python 3.12** | The language of the API. Brief uses it for its text and machine-learning libraries and for async code. | All of `api/app/`. | n/a |
| **FastAPI 0.143** | A Python web framework that builds routes from typed functions and checks requests automatically. | `app/main.py` defines 49 route handlers (47 documented, plus two hidden HEAD routes for health checks). Each has a group, a summary and the errors it can return, and a test fails if one is added without them. | The website; Postgres; R2; Gemini |
| **Uvicorn** | The server that runs a FastAPI application. | Started by the command in `api/Dockerfile`, with a 75 second keep-alive and a 20 second graceful shutdown. | FastAPI |
| **pydantic-settings** | Reads settings from the environment and checks them. | `app/config.py`. In production the server refuses to start on a built-in or short secret. | The host's environment |
| **PyJWT** | Reads and verifies signed tokens. | `app/auth.py` accepts only an HS256 token with an expiry, and refuses anything else. | The website's token |
| **cryptography (Fernet)** | Encrypts a value so it can be stored safely. | `app/two_factor.py` encrypts each person's authenticator secret before it is saved. | Postgres |
| **boto3** | Amazon's storage client, which also works with Cloudflare R2. | `app/storage.py` makes 5 minute upload links, reads a file's real size and first bytes, and deletes files. | R2 |

**API structure.** The routes are grouped as health, account, documents, answers, sharing, admin and events. Business logic lives in modules rather than in the route handlers: `ingestion.py` (reading), `retrieval.py` (search), `qa.py` (answers), `key_terms.py` and `checklist.py`, `grounding.py` (the quote check), `usage.py` (limits), `sharing.py`, `two_factor.py`, `admin.py` and `housekeeping.py`.

**Authentication.** The API trusts only a token signed by the website. It checks the signature, the algorithm (HS256 only) and the expiry, and every query is scoped to the person the token names.

**Middleware.** One piece of middleware gives every request an id (`X-Request-ID`), which appears in the logs and in the short reference code a person sees when something fails. There is no cross-origin (CORS) middleware, because the browser never calls the API.

**Background processing.** Reading a document runs as a FastAPI background task inside the API process, one document at a time for each person. When the server starts, two more tasks run: one empties the Bin after 7 days, and one, a little after startup, restarts any document left half-read by a restart. There is no separate job queue (see the System Design document, section 16).

## Database

| Technology | What it is, and why Brief uses it | Where and how it is used | Talks to |
|---|---|---|---|
| **Postgres, hosted on Neon** | A relational database. Brief uses one database for ordinary rows, vectors and text search, so a document's data stays together and is deleted together. | The live database is on Neon. Locally it is the `pgvector/pgvector:pg16` Docker image from `docker-compose.yml`. | The API |
| **pgvector** | A Postgres extension that stores vectors and finds the nearest ones. | The `embeddings` table holds a 768-number vector per clause. `retrieval.py` orders clauses by cosine distance to the question's vector. | Postgres |
| **Postgres full-text search** | Built-in word search with a ranking. | The `clauses.search_vector` column has a GIN index. `retrieval.py` uses `plainto_tsquery` and `ts_rank`. | Postgres |
| **SQLAlchemy 2 (async) with asyncpg** | A Python library that maps tables to classes, and a fast async driver. | `app/models.py` defines the tables, `app/db.py` the session; every route uses an async session. | Postgres |
| **Alembic** | Versioned changes to the database structure. | `api/migrations/versions/` holds 21 migrations. CI runs `alembic upgrade head` on a fresh database, and `/health/ready` is 200 only when the database is on the migration the code expects. | Postgres |
| **Redis, hosted on Upstash** | A fast key-value store. | Used only by the website, for the per-person rate limit: the email and a count, kept for about a minute (`web/lib/rate-limit.ts`, `ioredis`). | The website |
| **Cloudflare R2** | S3-compatible file storage. | One private bucket holds the uploaded files. The browser uploads straight to it by a short-lived link. | The browser; the API |

**Tables (14).** `users`, `documents`, `clauses`, `embeddings`, `extractions` (key terms), `checklist_answers`, `usage` (daily counts), `activity` (time and visits, counts only), `answer_traces` (how a question was answered, ids only), `dashboard_shares`, `two_factor`, `recovery_codes`, `trusted_devices` and `site_events` (demo video counts).

**Relationships.** A `user` owns `documents`. A `document` has `clauses`; a `clause` has one `embedding`. A `document` also has `extractions` and `checklist_answers`, and an extraction can point to the `clause` of its main quote. `answer_traces`, `dashboard_shares`, `two_factor`, `recovery_codes` and `trusted_devices` belong to a user. `usage`, `activity` and `site_events` are counters keyed by day.

**Queries and retrieval.** A question runs two queries on one document's clauses, a full-text query and a nearest-vector query, merged by reciprocal rank fusion (section 5, AI and LLM).

## AI and LLM

| Technology | What it is, and why Brief uses it | Where and how it is used | Talks to |
|---|---|---|---|
| **Google Gemini API, through google-genai 2.25** | Google's language-model service and its Python client. Brief uses it to find and explain what a document says. | `ingestion.py`, `qa.py`, `key_terms.py` and `checklist.py` create one client and call it through `model_call.py`. | The API; Google |
| **gemini-3.5-flash-lite** | The model that writes answers, key terms and the "before you sign" answers, and judges them. A small, fast model, chosen so a document can be read several times at a reasonable cost. | Temperature 0, JSON output matching a schema, system instructions in each module. | Gemini |
| **gemini-embedding-001** | The model that turns text into a list of numbers that capture its meaning. | Called with a 768-number output size for every clause when a document is read, and for every question. | Gemini |
| **FlashRank (ms-marco-MiniLM-L-12-v2)** | A small local model that re-orders search results. It is built and tested but **off by default**, because on the recorded retrieval test it lowered the right-clause-first rate from 96 to 67 percent. | `reranker.py`; used only when a search asks for it (`rerank: true` on `POST /documents/{id}/search`). | The API |

**Prompt engineering.** Each module has a fixed system instruction. The instructions say that the clauses are data to read and never instructions to follow, that the model must answer only from the numbered clauses, must set `found` to false rather than guess, must copy each quote exactly, and must never add a number its quotes do not contain. The prompt itself is the numbered clauses with short labels (for example `[C2]`) and then the question.

**Workflows, context and responses.** There are three AI workflows: reading (embeddings), asking (embedding, search, one answer call), and key terms and questions (three reads and a judge). Context is the document's own clauses only, with no memory between questions. Responses are structured JSON that code validates, and every quote is checked before anything is shown.

**Error handling.** `model_call.py` limits how many calls run at once, spaces them under a per-minute allowance, retries a refused or busy call with a wait and a time limit, and counts calls toward a daily cap. The full story is in the AI and LLM document.

## External integrations

| Service | What it is, and why Brief uses it | Where and how it is used | Talks to |
|---|---|---|---|
| **Google sign-in (OAuth)** | Lets a person prove who they are with their Google account, so Brief never handles a password. | `auth.ts` (Auth.js, Google provider, `prompt: select_account`). The redirect address is registered for briefcontracts.com. | The browser; the website |
| **Google Analytics** | Counts visits. Optional and off unless the visitor says yes. | `lib/analytics.ts` and `components/analytics-notice.tsx` load it on the first page only, with shortened addresses and advertising features off. | The browser; Google |
| **UptimeRobot** | Checks that the site is up and emails the owner if it is not. | Two monitors, every 5 minutes: the website, and the API's `/health/ready`. | The website; the API |

## Infrastructure and development tools

| Technology | What it is, and why Brief uses it | Where and how it is used | Talks to |
|---|---|---|---|
| **Vercel** | A host built for Next.js. | Runs the website; each pull request gets a preview build. | GitHub; the API |
| **Render** | A host that runs Docker containers. | Runs the API from `api/Dockerfile` and deploys it when `main` changes. | GitHub; Neon; R2; Gemini |
| **Docker** | Packages a program with what it needs. | `api/Dockerfile` (Python 3.12, Tesseract, a non-root user, a health check) is what Render runs. `web/Dockerfile` also exists for other hosts, with Next's standalone output. | n/a |
| **GitHub and GitHub Actions** | Hosts the code and runs the automatic checks. | `.github/workflows/ci.yml` and `audit.yml`; branch rules protect `main`. | Vercel; Render |
| **pnpm 12.4.2 and Node 22** | The website's package manager and runtime. | `web/package.json`, `pnpm-lock.yaml`; CI installs with a frozen lockfile. | n/a |
| **pip, pip-audit and pnpm audit** | The API's package installer, and two dependency vulnerability scanners. | `api/requirements*.txt`; `audit.yml` runs both on every push and every Monday. | The package registries |
| **pre-commit hooks** | Small checks that run before a commit. | `.pre-commit-config.yaml`: whitespace, large files, merge marks, YAML. | Git |
| **ESLint 9 and ruff** | Style and mistake checkers for TypeScript and Python. | Run in CI (`pnpm lint`, `ruff check .`). | n/a |
| **Vitest 5, Testing Library, jsdom** | The website's unit and component tests. | 156 test files; a coverage floor is enforced. | n/a |
| **Playwright 1.64 and axe-core** | Drives a real browser through the app, and scans pages for accessibility problems. | 39 spec files in `web/e2e/` run against a fake API; scans cover every main screen in light and dark. | The site; a fake API |
| **pytest, pytest-asyncio, httpx, pytest-cov** | The API's tests. | 54 test files; a 99 percent coverage floor is enforced. | Postgres |
| **Tesseract, OpenCV, PyMuPDF, pillow-heif** | Local software that reads PDFs and photos. None of them is a language model. | `ingestion.py`, `image_processing.py`, `pdf_text.py`. | The API |
