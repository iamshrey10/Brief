title: Project Overview
---
## What Brief is

Brief is a web application that reads a contract and explains it in plain English before the person signs it. It works on three kinds of document: a lease, a loan and a job offer. A person uploads a PDF, a scanned PDF, or up to five photos of the pages, and Brief does four things with it.

- It lists the **key terms**, such as the rent, the deposit, the interest rate or the notice period, and shows the exact quote each one came from.
- It lists the **questions people usually forget to ask** before signing, answers the ones the document covers, and says clearly when the document does not cover one.
- It answers **questions in the person's own words**, and every answer points to the clause it came from.
- It lets the person **take the explanation with them**: copy it, download it as a PDF, add the dates to a calendar, draft an email, or show a dashboard to someone they trust.

Brief is live at briefcontracts.com. It is explanation, not legal advice, and it never tells a person whether to sign.

## The problem it solves

Contracts are written to be skimmed, not understood. A lease, a loan agreement and a job offer are the documents people sign with the least help and the most at stake. Most people cannot afford a lawyer for each one, and a general chatbot is a poor substitute: it gives a fluent answer with nothing to check it against, and it can state a number that is not in the document.

Brief is built around the opposite rule: **nothing is shown that cannot be proved from the document's own words.** An answer has a quote, the quote is checked against the clause it names, and if the check fails the answer is thrown away. If the document does not say, Brief says so instead of guessing.

## Why it was built

The project's README gives the reason: these are the contracts people sign with the least help and the most at stake, and they are written to be skimmed and not read. A general chatbot will give a fluent answer with nothing to check it against. So Brief is built around one rule, nothing is shown that cannot be proved from the document's own words, and three design decisions follow from it:

1. **Proof before polish.** A model is allowed to find and explain, but every claim it makes about the document must be backed by a quote that a program can verify.
2. **Say "not covered".** An honest "the document does not say" is worth more than a confident guess, so the system is designed to prefer it.
3. **Privacy in layers.** The documents are private, so each layer of the system limits what it can reach (see the Technical approach below).

## Who it is for

Brief is for ordinary people about to sign something. The welcome page asks what brought them here, and the choices show the intended users:

| Person | The document | What they want to know |
|---|---|---|
| A renter | A lease | The deposit, the rent rules, and what ending early costs |
| A borrower | A loan agreement | The rate, the fees, and what a missed payment costs |
| A job seeker | A job offer | The notice period, non-compete terms, and the fine print |
| Anyone curious | A sample lease | How Brief reads a contract |

A family member or friend can be given read-only access to a person's dashboard for a limited time, so a second pair of eyes can look too.

## How it works

The journey from a file to an answer has five stages. Each is described in detail in the other documents.

1. **Sign in.** The person signs in with Google. A first visit goes to a short welcome page and a guided tour.
2. **Add a document.** The person chooses a PDF, a scan, or up to five photos of the pages, and says what kind of document it is. The file goes straight to private storage.
3. **Brief reads it.** In the background, Brief extracts the text (using optical character recognition for scans and photos), splits it into numbered clauses, and builds a meaning-based index of them. The person sees a progress line.
4. **The overview.** Brief reads the document three times with a language model, checks every quote and every number, keeps what most of the reads agree on, and shows the key terms and the questions to ask.
5. **Ask.** A question is matched to the clauses most likely to answer it, a model writes an answer, and every quote is checked word for word before the answer is shown.

## The main features

The full list, with the files that implement each one, is in the document *Key Features*. In short:

- Reading of PDFs, scans and photos, including iPhone photos. A scan or photo that is hard to read is flagged "Hard to read", and a file with no readable text fails with a plain reason.
- Key terms with quotes, and a click that opens the clause with the exact words highlighted.
- A "Before you sign" list of questions, with wording the person can send to the other side.
- Questions and answers with citations, and an honest "not covered".
- A summary the person can copy, download as a PDF, add to a calendar, or email.
- A dashboard, a document list with folders and search, and a Bin that keeps deleted documents for seven days.
- Sharing a dashboard for a time the person chooses, from one hour to ninety days.
- Optional two-step verification with an authenticator app.
- Daily limits that are shown plainly, a guided tour, light and dark appearance, and a layout that works on a phone and a laptop.

## Its value to a person

- **Fewer surprises.** The terms that cost money are pulled out and shown with their source.
- **Better questions.** The person leaves with specific questions to put to the other side.
- **Trust that can be checked.** Because every answer has a quote, the person can read the original words instead of trusting a summary.
- **Control.** Deleting a document removes its file and everything read from it, and deleting the account removes everything.

## The technical approach

Brief is two programs and a few services. The **website** (Next.js, hosted on Vercel) handles sign-in and is the only thing the browser talks to. The **API** (FastAPI, in a Docker container on Render) owns everything else: storage, reading documents, search, the language model and the rules. The data lives in a Postgres database with a vector extension (Neon), the files in a private bucket (Cloudflare R2), and short counters in Redis (Upstash). The language model is Google's Gemini.

The design choices that matter most:

- **The browser never calls the API.** Every call goes through the website, which checks the session and the rate limit and signs a token that lasts 60 seconds.
- **The model only sees text, and treats it as data.** The instruction to the model says the clauses are text to read, never instructions to follow.
- **Verification is ordinary code.** Whether a quote is really in a clause is decided by a program, not by the model.
- **Everything is tested before it ships.** A change goes in only through a pull request, and the three required CI jobs (API, website, and browser tests) must pass before it can be merged. Four more checks, two dependency audits and two Vercel checks, also run on each pull request (see the CI/CD document).

## What Brief is not

- It is **not legal advice**. It explains what a document says.
- It is **not an agent**. It does not call tools or take actions. It is retrieval, one grounded model call, and a verification step.
- It is **not tested on every kind of contract**. The recorded quality results are from small, hand-labelled documents (see the Project Summary), and a wrong or missing answer is still possible.
- The text of a document goes to Google's Gemini service to be read. People should read Google's current terms before uploading something sensitive.

## Where to look next

| To learn about | Read |
|---|---|
| The short version, with verified results | Brief-Project-Summary.pdf |
| Every feature and where it lives in the code | Brief-Key-Features.pdf |
| Every technology and why it is used | Brief-Technology-Stack.pdf |
| How the parts fit and how a request travels | The architecture and system design documents |
| How a change reaches the live site | Brief-CI-CD-Explanation.pdf |
| How the language model is used and limited | Brief-AI-LLM-Documentation.pdf |
