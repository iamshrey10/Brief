title: Key Features
---
## How to read this document

Each feature below answers the same seven questions: what it does, why it exists, how a person uses it, which website components implement it, which API routes and services support it, which database tables are involved, and whether AI is involved. File names are real and can be opened in the repository. Website files are under `web/` and API files under `api/app/`.

"AI" here always means a call to Google's Gemini model. Where a feature uses ordinary code around a model, the table says which part is which.

## The features

### Sign in and the welcome page

| | |
|---|---|
| What it does | A person signs in with Google. A first visit goes to a short welcome page that asks what brought them (a lease, a loan, a job offer, or just looking) and what to call them, then opens a guided tour. |
| Why it exists | Google handles passwords, so Brief never stores one. The name is used instead of an email address when a dashboard is shared. |
| How a person uses it | Presses "Sign in with Google", picks a reason (optional), enters a first and last name. |
| Website | `auth.ts` (Auth.js, Google only), `proxy.ts` (guards `/dashboard`), `components/welcome-setup.tsx`, `name-form.tsx`, `app/dashboard/welcome/` |
| API | `GET /me`, `PATCH /me` in `main.py` |
| Database | `users` (email, names, sign-up reason) |
| AI | No |

### Adding a document

| | |
|---|---|
| What it does | Accepts a PDF, a JPG, a PNG or a HEIC photo up to 50 MB, or up to five photos that are combined into one multi-page document. A person also says what kind of document it is, and can try a sample lease. |
| Why it exists | A file must be safe and the right kind before any money is spent reading it. Photos let a person scan a paper contract with a phone. |
| How a person uses it | Drops a file or chooses one, or takes photos with the camera and adds up to five pages, reorders them, then presses Upload. |
| Website | `components/upload-panel.tsx`, `document-upload.tsx`, `add-documents-card.tsx`, `upload-notifications.tsx`, `lib/upload.ts`, `lib/photos-pdf.ts` (builds the multi-page PDF in the browser) |
| API | `POST /documents` (checks type, size and limits, returns a 5 minute upload link), `PATCH /documents/{id}/confirm` (reads the real size and first bytes from storage), in `main.py` and `storage.py` |
| Database | `documents` (a row per upload, with a status); the file itself is in Cloudflare R2 |
| AI | No. The checks are rules: allowed types, 50 MB, 25 documents per person, 10 reads a day. |

### Reading a document

| | |
|---|---|
| What it does | In the background, extracts the text (PyMuPDF for a PDF with text, Tesseract OCR for scans and photos), splits it into numbered clauses, and builds a meaning-based index of the clauses. A scan or photo the OCR is not confident about (an average word confidence under 60 out of 100) is marked "Hard to read" with the status `needs_retake`, and stays usable. A file with no readable text fails with the reason "No text could be found in this file. A clearer scan or a text based PDF should work." |
| Why it exists | Everything else (search, answers, key terms) works on clauses, so a document must be read into clauses first. |
| How a person uses it | Watches a progress line such as "Reading part 3 of 9". Can press Try again or Read again. |
| Website | `components/now-reading.tsx`, `document-list.tsx`, `lib/documents.ts` (asks for the list every 5 seconds while a document is processing) |
| API | `ingestion.py` (`_read_document`, `extract_pages`, `embed_texts`, `recover_stranded_reads`), `image_processing.py` (OCR, straightening), `clause_segmentation.py`, `pdf_text.py`; started as a FastAPI background task by the confirm, retry and reread routes |
| Database | `clauses` (text, page, place, a full-text search column), `embeddings` (a 768-number vector per clause), `documents` (status, progress, failure reason, OCR confidence) |
| AI | Partly. The meaning vectors come from `gemini-embedding-001`. Text extraction, OCR and the splitting into clauses are ordinary code (Tesseract is OCR software, not a language model). |

### Key terms with quotes

| | |
|---|---|
| What it does | Pulls out the terms that matter for the kind of document: 12 for a lease (rent, deposit, dates and so on), 13 for a loan, 10 for a job offer and 6 for anything else. Each shows the value, the page, and up to three quotes. A term the document does not state is listed as "not mentioned". |
| Why it exists | The terms that cost money are buried in the text. Showing each with its quote lets a person check it in seconds. |
| How a person uses it | Opens a document and reads the Overview. Clicking a quote opens the clause with the exact words highlighted. |
| Website | `components/overview-panel.tsx`, `clause-viewer.tsx`, `lib/overview.ts`, `lib/highlight.ts` |
| API | `GET /documents/{id}/key-terms` in `main.py`; `key_terms.py`, `key_term_fields.py`, `grounding.py`, `consensus.py` |
| Database | `extractions` (a row per field, found or not, with its quotes), `usage` (counts the read toward the daily limit) |
| AI | Yes. The model reads the clauses three times (seeds 1, 2 and 3, temperature 0). Ordinary code then checks every quote and every number, and keeps a term only if more than half the reads found it. The result is saved, so opening it again is free. |

### Before you sign

| | |
|---|---|
| What it does | Lists the questions people most often forget to ask (10 for a lease, a loan or a job offer, and 6 for other documents), answers the ones the document covers with quotes, and marks the rest as "the document doesn't say". For each gap it offers wording the person can send to the other side. |
| Why it exists | What a contract leaves out can matter as much as what it says. |
| How a person uses it | Reads the list in the Overview, copies the suggested wording, or emails the open questions. |
| Website | `components/overview-panel.tsx`, `open-questions.tsx` (also on the Dashboard), `lib/questions-email.ts` |
| API | `GET /documents/{id}/checklist`; `checklist.py`, `checklist_questions.py` |
| Database | `checklist_answers` |
| AI | Yes. The model answers the questions three times, code checks the quotes and keeps answers by vote, and then a separate model call acts as a judge for each answer, alone, with two looks and a third if they disagree. An answer the judge does not confirm is withheld. |

### Asking questions

| | |
|---|---|
| What it does | Answers a question typed in plain words (up to 1,000 characters). The answer shows the clause it came from. If the document does not seem to cover the question, it says so. |
| Why it exists | People think in questions, not in clause numbers. |
| How a person uses it | Opens the Ask tab, types a question or taps a suggested one, and reads the answer with its source. |
| Website | `components/chat-panel.tsx`, `lib/ask.ts`, `lib/suggested-questions.ts` |
| API | `POST /documents/{id}/ask` in `main.py`; `qa.py` (`answer_with_path`, `generate_answer`), `retrieval.py` (`hybrid_search`), `grounding.py` (the quote check), `traces.py` |
| Database | `clauses`, `embeddings` (searched), `answer_traces` (ids only, kept 30 days), `usage` |
| AI | Yes. The question is turned into a meaning vector, two searches find the best 8 clauses, and `gemini-3.5-flash-lite` writes a structured answer with quotes. The search, the quote check and the "not covered" decision are ordinary code. |

### Finding words in a document

| | |
|---|---|
| What it does | A find box marks every match of a word or figure in the clauses and steps through them with the up and down buttons. |
| Why it exists | Sometimes a person knows the word they are looking for. |
| How a person uses it | Types at least two characters and presses Enter or the arrows. |
| Website | `lib/find.ts` (case-insensitive, matches plain characters so "$1,450" and "(b)" work), `components/clause-viewer.tsx`, `document-workspace.tsx` |
| API | None. It runs in the browser on the clauses already loaded. |
| Database | None |
| AI | No |

### Taking the summary away

| | |
|---|---|
| What it does | Copies the summary as plain text, downloads it as a PDF, adds the clearly stated dates to a calendar file, drafts an email holding the open questions, and prints. On a phone the PDF button opens the share sheet so the file can be saved to Files or sent. |
| Why it exists | The explanation should leave the screen with the person. |
| How a person uses it | Presses a button in the row above the key terms. |
| Website | `components/summary-actions.tsx`, `calendar-button.tsx`, `print-button.tsx`, `lib/summary-text.ts`, `lib/pdf.ts` (a PDF written in the browser), `lib/calendar.ts`, `lib/download.ts` |
| API | None. Everything is built in the browser from what is already loaded, and nothing is sent. |
| Database | None |
| AI | No (the content came from the earlier steps) |

### The dashboard

| | |
|---|---|
| What it does | The first screen after sign-in: how many documents there are and their state, the soonest dates, the time left on a lease, what Brief found in each document, the questions still to ask, recent activity, and a breakdown by kind. Each tile opens the document list. |
| Why it exists | A person with several documents needs one place to see where they stand. |
| How a person uses it | Reads it, and taps a tile or a date. |
| Website | `app/dashboard/page.tsx`, `components/dashboard-stats.tsx`, `lease-countdown.tsx`, `reminder-bell.tsx`, `document-analysis.tsx`, `recent-activity.tsx`, `kind-breakdown.tsx`, `open-questions.tsx`, `lib/dashboard.ts`, `lib/key-dates.ts` |
| API | `GET /documents`, `GET /me/insights`, `GET /me/key-dates` |
| Database | `documents`, `extractions`, `checklist_answers`, `activity` |
| AI | Indirectly. The dates and findings come from the key terms and questions, which a model found and code verified. The dashboard itself only counts and sorts. |

### Documents, folders and the Bin

| | |
|---|---|
| What it does | Lists documents with search, a filter by kind, and sorting. A document can be renamed, have its kind changed, be moved between folders, be read again, be opened in its original form, or be deleted. Deleted documents go to a Bin for 7 days and can be restored. |
| Why it exists | A mistake should be recoverable, and a person should be able to keep their documents tidy. |
| How a person uses it | Uses the icons on a row, or the Bin section of the Profile page. |
| Website | `components/document-list.tsx` (including the View original button), `bin-list.tsx`, `lib/folders.ts`, `lib/trash.ts`, `app/dashboard/documents/`, `app/dashboard/bin/` |
| API | `GET /documents`, `PATCH /documents/{id}`, `POST /documents/{id}/move`, `GET /documents/{id}/file`, `DELETE /documents/{id}`, `GET /trash`, `POST /documents/{id}/restore`, `DELETE /documents/{id}/permanent`; `filing.py`, `folders.py`, `housekeeping.py` (empties the Bin after 7 days) |
| Database | `documents` (including `deleted_at`, `folder`), and the file in R2 |
| AI | No |

### Sharing a dashboard

| | |
|---|---|
| What it does | Lets a person show their dashboard, read-only, to someone they approve, for a time they pick: 1 hour, 6 hours, 24 hours, 7, 15, 30 or 90 days. Up to 5 people. Brief writes the invitation with a link and a six-digit code, and the owner approves the request before anyone can see anything. Access can be taken back at any time. |
| Why it exists | A parent, a partner or a friend can be a second pair of eyes without being given a password. |
| How a person uses it | On the Shared page, enters a name and a time and presses Create invitation, then sends the link and the code. The other person signs in with Google, opens the link and enters the code. |
| Website | `components/sharing-panel.tsx`, `access-picker.tsx`, `join-by-link.tsx`, `join-form.tsx`, `shared-with-you.tsx`, `shared-dashboard-view.tsx`, `pending-badge.tsx`, `app/dashboard/shared/`, `app/shared/join/` |
| API | `POST /shares`, `GET /shares`, `POST /shares/{id}/approve`, `PATCH /shares/{id}`, `DELETE /shares/{id}`, `POST /shares/join`, `GET /shared`, `GET /shared/{id}/dashboard`; `sharing.py` |
| Database | `dashboard_shares` (the link and code are stored only as hashes) |
| AI | No |

### Two-step verification

| | |
|---|---|
| What it does | An optional second lock. A person scans a QR code with an authenticator app and enters a six-digit code. Ten recovery codes are given once. A browser can be trusted for 30 days. Five wrong codes lock the check for 15 minutes. |
| Why it exists | The documents are private, and a signed-in session alone may not be enough for everyone. |
| How a person uses it | Turns it on in the Profile page, and is asked for a code after signing in on a new browser. |
| Website | `components/two-factor-panel.tsx`, `verify-form.tsx`, `lib/two-factor*.ts`, `app/two-factor/`, and the check in `proxy.ts` |
| API | `GET /me/2fa`, `POST /me/2fa/setup`, `enable`, `verify`, `check`, `disable`, `recovery-codes`; `two_factor.py` (the secret is encrypted with Fernet) |
| Database | `two_factor`, `recovery_codes` (hashed), `trusted_devices` (hashed) |
| AI | No |

### Daily limits and usage

| | |
|---|---|
| What it does | Each person has a daily allowance: 40 questions, 10 document reads and 20 overviews (the first time a document's key terms are built counts as one overview, and so does the first time its list of questions is built; opening a saved one is free). The Profile page shows what is left. A site-wide daily cap on model calls is the real guard on spending. |
| Why it exists | Every read and answer costs a model call, so the cost must be bounded. |
| How a person uses it | Sees the remaining counts, and a plain message when a limit is reached. |
| Website | `components/usage-card.tsx`, `lib/usage.ts`, `lib/daily-limit.ts` |
| API | `GET /me/usage`; `usage.py`, `model_call.py` |
| Database | `usage` (a count per person, day and kind) |
| AI | No (it limits AI) |

### The guided tour and appearance

| | |
|---|---|
| What it does | An eight-step tour opens after the welcome page, points at each part of the app, follows the person from page to page, and can be replayed from the Profile page. Appearance can be light, dark or the computer's setting. |
| Why it exists | A first visit should explain itself, and people have different preferences for light and dark. |
| How a person uses it | Presses Next or Skip tour, and chooses an appearance in the Profile page. |
| Website | `components/guided-tour.tsx`, `lib/tour-steps.ts`, `lib/tour-state.ts`, `components/theme-choice.tsx`, `theme-provider.tsx`, `theme-toggle.tsx` (next-themes) |
| API | None |
| Database | None (the tour step is kept for the life of the browser tab) |
| AI | No |

### The admin page

| | |
|---|---|
| What it does | Shows the owner how Brief is used, as counts only: people, sign-ins, documents, questions, time in Brief, and how often the demo video is opened and finished, with charts over 7, 30 or 90 days and daily and monthly reports to download as CSV or PDF. It never shows a document, a question or a name. |
| Why it exists | The owner needs to know how the product is used without seeing anyone's content. |
| How a person uses it | Only the accounts named in the `ADMIN_EMAILS` setting can open it; for anyone else the page does not exist. |
| Website | `app/dashboard/admin/`, `components/admin-dashboard.tsx`, `admin-reports.tsx`, `charts.tsx`, `lib/admin.ts` |
| API | `GET /admin/stats`, `GET /admin/report`; `admin.py` |
| Database | `activity` (seconds and visits per person per day), `site_events` (demo video counts per day) |
| AI | No |

### The first page, the demo video and optional visit counting

| | |
|---|---|
| What it does | The public landing page explains Brief, offers a demo video of about 83 seconds, and, only if the visitor says yes, counts visits with Google Analytics. The Privacy and Terms pages explain what is kept. |
| Why it exists | Visitors need to understand the product before signing in, and the owner wants to know where visitors come from without tracking anyone who has not agreed. |
| How a person uses it | Presses "Watch how it works", or answers the small notice at the bottom of the page. |
| Website | `app/page.tsx`, `components/landing-hero.tsx`, `landing-features.tsx`, `landing-steps.tsx`, `demo-video.tsx`, `analytics-notice.tsx`, `lib/analytics.ts`, `app/privacy/`, `app/terms/`, `app/not-found.tsx` |
| API | `POST /events/{name}` (counts the video being opened or finished, as one number per day, with no cookie or address) |
| Database | `site_events` |
| AI | No |

## Which features use AI

| Feature | Uses a language model? | Which part |
|---|---|---|
| Reading a document | Partly | Meaning vectors from the embedding model |
| Key terms | Yes | The answer model, three reads |
| Before you sign | Yes | The answer model, three reads, and a judge |
| Asking questions | Yes | The embedding model and the answer model |
| Everything else in this document | No | Rules and ordinary code |

Even where a model is used, the checks on its output (that a quote is really in a clause, that a number is in its quote, that most reads agree) are ordinary code.
