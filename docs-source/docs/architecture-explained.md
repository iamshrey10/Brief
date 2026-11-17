title: Architecture Explanation
---
## What happens when a person opens Brief

1. **The browser asks for briefcontracts.com.** Vercel runs the Next.js website and answers with the first page. The page is built on the server, which asks Auth.js whether this visitor is signed in, so a signed-in person sees "Dashboard" and a signed-out person sees "Sign in with Google".
2. **A small notice may appear at the bottom of the first page** asking whether visits may be counted. Nothing is sent to Google Analytics unless the visitor says yes, and the counter stops as soon as they leave the first page.
3. **Signing in.** Pressing "Sign in with Google" sends the browser to Google. Google asks the person to choose an account and, when they agree, sends the browser back to Brief with a one-time code. The website exchanges the code with Google and sets a session cookie. Brief never sees a password.
4. **Opening the dashboard.** Before any page under `/dashboard` is built, a guard in `proxy.ts` runs on the server. A signed-out visitor is sent back to the first page. A person who turned on two-step verification and has not yet passed it in this browser is sent to the code check. Otherwise the page is built: the server signs a 60 second token for this person and asks the API for what the page needs, such as the list of documents.
5. **The first time Brief ever sees a person,** the API creates their row from the email in the token. A first visit also goes to the short welcome page and the guided tour.

## What happens when a person uses a feature

Take the most involved one: a person types "What is the security deposit?" in the Ask tab and presses Ask.

1. The question box (the chat component) checks the question is not empty and not over 1,000 characters, then sends it to the website's own address `/api/backend/documents/{id}/ask`.
2. The website's route handler asks Auth.js who is signed in. If nobody is, it answers 401.
3. It counts the request in Redis. If the person has made more than 120 requests this minute it answers 429 with a "try again in N seconds" hint.
4. It signs a token for this person that lasts 60 seconds, gives the request a new id, and calls the API with both.
5. The API checks the token, finds the person, checks that the document is theirs and is ready, and checks that they have questions left today (40 a day).
6. It searches the document's clauses two ways and keeps the best 8, asks the model for an answer with quotes, and checks every quote against its clause.
7. It saves a trace (ids only) and the use, and returns the answer. The route handler passes it back with the request id, and the chat shows the answer with its source. Clicking the source opens the clause with the words highlighted.

The other features follow the same path, with different work in step 6. Listing, renaming, deleting and sharing use no model at all.

## How the frontend processes an interaction

- **Server-rendered pages** (the dashboard, the document list, Profile, Admin) are built on the server, which fetches what they need from the API with a fresh token and sends finished HTML, so the first view needs no extra round trip.
- **Interactive parts** (upload, chat, sharing, the tour, the charts) are client components. They call the website's `/api/backend/*` routes with `fetch`, keep their own state in React, and show a loading state, an answer or a plain error message.
- **Work that needs no server** is done in the browser: finding words in a document, building the summary PDF and the calendar file, and combining up to five photos into one PDF.
- A thin bar across the top of the page shows while another page is on its way, and every page respects the reader's "reduce motion" setting.

## How the request reaches the backend

The browser can reach only the website. The website's route handlers (`web/lib/proxy.ts`) are the only door to the API. For each call they check the session, count the request, add a request id, sign the token and forward the request to the API's address. If the API does not answer, or answers with something that is not JSON, the handler returns a clean JSON error with a 502, so the page can show a message instead of a blank screen.

## How business logic is executed

The API is a FastAPI application. A route handler does only the checking and then hands the work to a module:

- `ingestion.py` reads documents. `retrieval.py` searches them. `qa.py`, `key_terms.py` and `checklist.py` call the model and check what it returns. `grounding.py` decides whether a quote is really in a clause. `usage.py` and `model_call.py` enforce the limits. `sharing.py`, `two_factor.py`, `admin.py` and `housekeeping.py` do the rest.
- The checks that matter most, such as whether a quote is in its clause, are plain programs that can be tested without a model.
- Reading a document takes minutes, so it does not run inside the request. The route answers at once ("processing"), and a background task does the reading while the page shows progress.

## When the database is accessed

On almost every request: to find the person, and to find the document and check it belongs to them. In addition:

- **Reading a document** writes clauses and vectors, and updates the status and progress.
- **Asking** runs a full-text query and a nearest-vector query on that document's clauses, then saves a trace and a count.
- **The overview** reads the saved key terms and questions, or, the first time, saves what the model produced.
- **Sharing, two-step, the Bin and the admin page** read and write their own tables.

The database is never reached from the browser or the website. Only the API talks to it.

## When an AI or language model service is invoked

A model is called in only three situations, and always from the API:

1. **When a document is read**, to turn each clause into a meaning vector (the embedding model).
2. **The first time a document's overview is opened**, to find the key terms and answer the questions to ask. Each is read three times, and a judge checks each answer. The result is saved, so opening it again is free.
3. **When a question is asked**, to turn the question into a vector and to write one answer.

Nothing else calls a model. In particular, listing, renaming, deleting, sharing, the dashboard and the admin page never do. Every call goes through one gate that limits how many run at once, waits out a rate limit, and counts toward a daily cap for the whole site.

## How the response is processed

A model's reply is never shown as it is. For an answer, the reply must be JSON with a `found` flag, an answer and citations. Each citation's quote is checked against the clause it names, ignoring case and spacing but nothing else, and a quote that is not really there is dropped. For a key term, every number in the value must also appear in a quote. If nothing is left, the person is told "This document doesn't seem to cover that" or that Brief could not confirm an answer from the document's exact wording. Only then is the response turned into the shape the page expects.

## How the response reaches the person

The API's JSON goes back to the website's route handler, which adds the request id and returns it to the browser. The chat or overview component draws it. If a request fails, the message the person sees ends with a short reference code, which is the request id. The owner can paste it into `api/scripts/find_request.py` to find the matching log lines.

## What happens when a service fails

| If this fails | What happens |
|---|---|
| **Redis** (the rate-limit store) | The website lets ordinary requests through and logs a short line saying why, because the counter is only a guard against a flood. For guessing two-step codes the counter is the protection itself, so there the request is refused. |
| **The API is unreachable or answers with something else** | The website's handler returns a 502 with "could not reach the reading service", and the page shows a message. |
| **The database** | `/health/ready` answers 503, requests that need it fail with an error, and UptimeRobot emails the owner within about 5 minutes. |
| **Gemini is busy or rate limited** | The model gate waits and tries again, within a time limit of about 50 seconds. If it still fails, the person sees "try again in a moment" and a reference code. A document being read is marked failed with a reason ("rate limit", "daily limit" or "service error") and can be tried again. |
| **A daily limit is reached** | The person gets a plain message saying which limit and when it resets, with a "Retry-After" hint. Reading what is already saved is still free. |
| **Storage** (R2) | An upload or a read that cannot reach storage fails with the reason "storage", and the person can try again. |
| **The server restarts while a document is being read** | A recovery task, run a little after startup, finds documents left "uploaded" or "processing" with nothing working on them and reads them again. |
| **A file is not what it claims** | The API reads the real size and first bytes from storage after the upload. An empty file, one over 50 MB, or one that is not the kind it claims is deleted and refused. |
| **A scan or photo is hard to read** | It is flagged "Hard to read" and stays usable. A file with no readable text fails with a reason such as "A clearer scan or a text based PDF should work." |
