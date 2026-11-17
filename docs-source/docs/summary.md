title: Project Summary
---
## Introduction

Brief is a web application, live at briefcontracts.com, that reads a lease, a loan or a job offer and explains it in plain English before a person signs it. A person uploads a PDF, a scan or up to five photos of the pages. Brief pulls out the key terms with their quotes, lists the questions people usually forget to ask, and answers questions with the clause each answer came from. If the document does not say, it says so. It explains what a document says. It is not legal advice.

## Problem statement

People sign leases, loans and job offers with little help and a lot at stake. The documents are written to be skimmed. A general chatbot is a poor guide, because it gives a fluent answer with nothing to check it against, and it can state a figure that is not in the document. A person needs an explanation they can verify.

## Proposed solution

Brief explains a document and **proves** what it says. The rule that shapes the whole system is that nothing is shown that cannot be traced to the document's own words:

- Every answer and every key term carries a quote.
- A program, not the model, checks that each quote really appears in the clause it names, word for word. A quote that fails is thrown away.
- Every number in a key term must also appear in its quote.
- If nothing survives the checks, the person is told the document does not seem to cover the question.

## Main technologies

| Layer | Technology |
|---|---|
| Website | Next.js 16, React 19, TypeScript, Tailwind CSS 4, Auth.js (Google sign-in) |
| API | FastAPI on Python 3.12, SQLAlchemy 2 (async), Alembic |
| Database | Postgres with the pgvector extension (hosted on Neon) |
| Files and counters | Cloudflare R2 (private bucket), Redis (Upstash) |
| Reading scans and photos | Tesseract OCR with OpenCV |
| Language model | Google Gemini: gemini-3.5-flash-lite for answers, gemini-embedding-001 for meaning vectors |
| Hosting | Vercel (website), Render (API container) |
| Build and checks | GitHub Actions, Vitest, Playwright, pytest, ruff |

## Important features

- Reads PDFs, scanned PDFs and photos (including iPhone photos). A hard-to-read scan is flagged "Hard to read" and stays usable, and a file with no readable text fails with a plain reason.
- Key terms with quotes, and a click that opens the clause with the exact words highlighted.
- "Before you sign": the questions people forget to ask, answered from the document or marked as not covered.
- Questions and answers with citations.
- A summary to copy, download as a PDF, add to a calendar, or email.
- A dashboard, folders, search, a 7-day Bin, and read-only sharing for a time the person chooses.
- Optional two-step verification, daily limits, a guided tour, light and dark mode, and a layout that works on a phone.

## Technical highlights

1. **A verification step made of ordinary code.** The quote check, the number check and the "kept by vote" rule are plain programs, so they can be tested and they do not depend on the model behaving.
2. **Hybrid search.** Two searches run together, Postgres full-text search for exact words and figures, and pgvector for meaning, and their results are merged by rank. On the recorded retrieval test (24 questions, one small document), keyword search alone found the right clause first 4 percent of the time, and the hybrid and vector search alone each found it 96 percent of the time. The test is too small to show where the keyword half helps, so the hybrid is kept for the reason in its design: exact figures and defined terms are where meaning-based search can miss.
3. **Three reads and a vote.** The key terms and the questions to ask are each read three times with fixed seeds and kept by majority vote, because the same document read twice by a model can come out differently. A second, independent model call judges each answer to a question.
4. **Layered privacy.** The browser never calls the API. The website signs a token that lasts 60 seconds. Files go straight to private storage by a 5 minute link. Logs hold fixed messages and ids and never document text. A test reads every logging call.
5. **Guarded cost.** Per-person daily limits (40 questions, 10 reads, 20 overviews) and a site-wide daily cap on model calls keep the spending bounded.
6. **A pipeline that checks every change.** A change enters only by pull request, and three CI jobs must pass before it merges.

## Verified results

These numbers come from recorded runs and from the CI run of November 17, 2026. They are small tests on hand-labelled documents, and they are not a promise about every contract.

| Measure | Result | Source |
|---|---|---|
| Automated tests passing | 3,576 in total: 1,298 API, 1,937 website, 341 in a real browser | CI run on the final commit of PR #99 |
| API code covered by tests | 99 percent (floor enforced in CI) | CI run |
| Website code covered by tests | about 98 percent of statements | CI run |
| Question answering, lease and loan fixture | Right clause cited for 32 of 32 answerable questions; 18 of 18 unanswerable questions correctly declined | evals/results/qa-2026-10-27.md |
| Question answering, job offer fixture | 25 of 25 right; 18 of 18 declined | evals/results/qa-offer-2026-10-27.md |
| Question answering, education loan fixture | 21 of 24 right (88 percent); 1 of 18 unanswerable questions got an invented answer (6 percent) | evals/results/qa-loan-2026-10-27.md |
| Key terms | 57 of 60 right (95 percent); 3 cited a wrong clause; 0 invented values among 36 not-mentioned terms | evals/results/key-terms-2026-10-25.md |
| Questions to ask | 39 of 39 answered rightly; 21 of 21 absent ones correctly reported as not mentioned | evals/results/checklist-2026-10-08.md |

The loan result is the weakest and is reported as it is. These evaluations run against the real Gemini API on a small number of documents, and CI re-checks the recorded results against minimum limits in `evals/thresholds.json`, without calling the model.

## Future improvements

These are ideas, not promises, and each follows from a limit described in the System Design document.

- Database backups with a tested restore, and a staging site to try a change before it goes live.
- An automatic check of the live site after each deploy, and an automatic rollback.
- Moving document reading out of the API process into a separate job queue, so reading can scale and survive restarts more easily.
- More labelled documents for the evaluations, especially loans, and more kinds of document.
- Re-testing the reranker (a second search stage that is built but off by default) on longer documents.
- Enforcing the website's content security policy, which is currently in report-only mode.
