# Where Brief stands

A plain account of what works today, what is still missing, and what I am unsure about. I update it every week so you can
hold my pace against my promises.

**Last updated:** November 13, 2026

## The short version

Brief is live at [briefcontracts.com](https://briefcontracts.com). You can sign in with Google, upload a contract, a scan or a
phone photo, see its key terms and the questions it leaves open, ask questions and get an answer with a checked quote, share your
dashboard for a time you choose, and take the summary away as a PDF. It works on a phone and a laptop.

It has only been used by me so far. I have run the real sign-in, an upload, a read and a question on the live site several times, but
no outside person has tried it, so expect surprises. What is left is small and listed below.

## By the numbers

| | |
|---|---|
| Commits | about 590 |
| Tests | about 3,490 (1,291 backend, 1,875 frontend, 319 in a real browser), run on every pull request |
| API routes | 47 |
| Database tables | 14 |
| Evaluations | 5 (search, question answering on three documents, key terms, must-ask checklist, steadiness) |
| Documents it can read | PDFs (including scanned ones, read by OCR), and phone photos or scans (JPG, PNG, HEIC) |
| Limits | 50 MB a file, 25 documents a person, 100 pages a document |
| Daily allowance per person | 40 questions, 10 document reads, 20 overviews |
| Time to answer a question | about 2.5 seconds on average on my test documents (measured before it went online) |
| Time to read a whole document | about 10 to 30 seconds on my test documents, since the key terms and the questions are each read three times |

## What works today

- **Sign in** with Google, with optional two-step verification (a 6 digit code from an authenticator app). Every request is checked
  twice, once in the website and once in the API.
- **Upload** a PDF, a scan, or a photo (including from a phone camera). A blurry photo is refused with a reason instead of being
  quietly accepted. A document that fails says why in plain words, and a long one shows how far it has got.
- **Key terms** such as the interest rate, fees, deposit and dates, each with its quote. Clicking one jumps to the clause and
  highlights the exact words.
- **Before you sign.** For a loan, lease or job offer, the questions people most often skip, answered from the document with the
  quotes behind them, or marked as not covered, with wording for asking the other side.
- **Ask a question and get a checked answer.** The answer only appears if its quote really is in the document. If the document
  doesn't say, Brief says that.
- **Take it with you:** copy the summary, download it as a PDF, add its clear dates to a calendar, email the open questions, print
  it, and find words in the clause text.
- **A Dashboard** with where your documents stand, the soonest dates, the questions still to ask, and what Brief found in each.
  Opening it never calls the model.
- **Documents:** folders, search, rename, read again, and a Bin that keeps deleted documents for 7 days.
- **Sharing.** Show your dashboard to someone you approve for 1 hour up to 90 days, with a countdown, and take it back at any time.
- **A Welcome page and a short tour** for first-time visitors, which can be replayed from Profile.
- **Steadier results.** The key terms and the questions are each read three times with fixed seeds and kept by vote.
- **Easier to debug.** Every call carries a request id that appears in every log line it causes, and a failure message ends with a
  short `Reference` code that finds it.
- **Checked in a real browser.** The browser tests cover the pages anyone can reach and, signed in with a sign in that exists only
  outside production, uploading, renaming, reading again, deleting, sharing, the tour, asking and clicking a source, at phone width
  too, with accessibility scans of the main screens. They have found and fixed real problems, such as a missing page region, faint
  error text, a skipped heading level, and a page that jumped about while it loaded.
- **Security basics.** Uploads are checked against what the file really is, tokens must expire, the servers refuse weak secrets in
  production, you can delete your account and everything in it, and a scan of the libraries runs weekly. The README lists what is
  and is not covered.

## What is left

| Piece | Status |
|---|---|
| The demo video | Re-recorded on November 13 with the final screens, in light theme at 1080p, about 1 minute 25 seconds, with a stack scene |
| An alert that tells me when the site is down | Not set up yet |
| The per-minute request limit in the website | Built, but on the live site it cannot reach its Redis and lets requests through. The setting is now cleaned up on read and the log says what looks wrong; I still need to confirm the value in Upstash. The daily limits and the site-wide cap are enforced by the API and work |
| Build and test tools | 32 open dependency alerts, all in development tools (vite, hono, undici and similar). None ships to a user, and the scan of what ships passes. I will update them in a separate careful change |
| An agent step that retries a weak search | Not started, and may not be worth it |
| Word (.docx) files, several files in one upload, sharper handling of low quality photos | Not started |

## Where I am unsure

- **The test sets are small.** The 24 search questions, the 135 answer questions on three short documents (a loan and lease, a job
  offer and an education loan, each 17 clauses; 81 with an answer and 54 without), and the key-terms check are all short, clean
  examples. The scores on them (96% right clause first; on the first two documents 57 of 57 cited correctly and 36 of 36 correctly
  declined; on the education loan 21 to 23 of 24 and 17 to 18 of 18 across three runs) are not a claim about contracts in general,
  and a difference of one or two answers between runs is noise at this size. Twenty of the 36 declined questions are near misses,
  where the topic is in a clause but the fact asked for is not, and those found something real: twice a question asking for one
  specific detail was answered with the nearest related fact. I changed the answering instruction to treat a related fact that lacks
  the requested detail as not covered, and both documents then scored 100 percent. That is one run each, so it is evidence and not
  proof.
- **Real documents are messier.** Key terms can rest on up to three checked quotes, so a fact spread over two sentences is no longer
  dropped. That is one lease, and I have not confirmed which terms a real lease genuinely lacks.
- **Steadier is not the same as more accurate.** On three real leases the voted key terms changed 0, 0 and 2 fields between runs,
  where one unseeded read changed 4, 5 and 5. Voting helps but did not fully steady the longest lease. I have not read that lease to
  say whether the voted version is stricter or the single read was counting passing mentions. Voting costs time: a document makes
  ten or more model calls.
- **Keyword search is weak.** It scored 4% on its own, so search relies on meaning-based matching. My test set has no exact-term
  questions, so I cannot say how it does on those.
- **Reranking made things worse** (67% against 96%), so it is switched off by default.
- **Daily limits are per account.** Someone who deletes their account and signs up again gets a fresh allowance. The site-wide
  daily cap on model calls is what bounds the cost.
- **The slowest answer took 41 seconds.** I have not looked into why.
- **The live site has seen very little use.** Hosting is on small plans, which is fine for a launch and not for heavy use.
- **The browser tests use a fake API.** It checks tokens like the real one and refuses what the real one would, but it is not the
  real one. The accessibility scans find what a machine can detect, which is only part of the problems, so a person should still try
  the screens with a keyboard and a screen reader.
- **The Privacy and Terms pages are plain language I wrote.** A lawyer has not reviewed them.

## Update log

| Date | What changed |
|---|---|
| Oct 3 | First version of this page. Key-term extraction finished on the backend. 49 commits, 242 tests. |
| Oct 4 | Must-ask questions finished on the backend, with a second check on the answers. The expected finish moved from about November 1 to about October 30. 65 commits, 319 tests. |
| Oct 8 | The Overview screen and a real dashboard shipped, with delete, edit, read again, reasons a read fails, limits, and read progress. Key terms and questions are now read three times and kept by vote, which made them steadier but not more accurate. 116 commits, 810 tests. The finish stays about October 30. |
| Oct 10 | Security work: uploads are checked against what the file really is, tokens must expire, both servers refuse weak secrets in production, a dependency scan found and fixed 10 real vulnerabilities and now runs weekly, and you can delete your account and everything in it. Steadiness was measured on two more real leases. 152 commits, 1,003 tests. The finish stays about October 30. |
| Oct 16 | Daily limits, abandoned upload cleanup, timing of every model call, and a build that fails if a recorded quality score drops (Oct 11 to 12). A browser test of the whole app by hand found a rate limit failure with nothing in the log, a deposit missing from key terms, and one tap sign in; each was fixed, and a key term can now rest on up to three checked quotes (Oct 13). Browser tests of the pages anyone can reach, a health check that says whether the server can do real work, request ids, and a short reference code on failure messages (Oct 14 to 16). 240 commits, 1,377 tests. About 75 percent, finish still around October 30. |
| Oct 21 | Answer traces (what each question used, ids only, found from a reference code), documentation of every route checked against the code, example settings files, a script for the storage upload rules, a deployment checklist, and a test-only sign in with a fake API that lets the signed in screens be tested in a real browser: 88 browser tests, accessibility scans of every main screen and state, and four real problems they found fixed. 313 commits, 1,588 tests. About 80 percent, and the finish moved from about October 30 to about November 3 for the reason given above. |
| Oct 28 | The landing page was rebuilt (top bar, hero, what you get, how it works, footer) and the signed in screens got one shared top bar; the Overview and Ask tabs are clearer. A third question set (an education loan) was added and the answering instruction gained a rule for "which one" questions, measured on all three before it was kept (a second rule for simple arithmetic was tried and removed because it cost an answer). The website file `middleware` was renamed to `proxy`, and a check, run in CI too, now refuses any commit message that credits a tool. 404 commits, 1,853 tests. About 85 percent, and the finish moved from about November 3 to about November 7 for the reason given above. |
| Nov 2 | A Dashboard became the first screen, with a place to add a document, counts, dates, the questions still to ask and what Brief found in each document. Scanned PDFs are now read by OCR after a real scan failed. A document has one row of actions (copy or download the summary as a PDF, calendar, email, print) and a find box. Real files of each kind were run through the real services: PDF, photos of a lease, a job offer and a loan, and a deliberately smeared photo, which was refused with a clear reason. Work now goes in through short branches and pull requests, and main is protected. 471 commits, 2,230 tests. About 88 percent, and the finish moved from about November 7 to about November 11 for the reason given above. |
| Nov 3 to 12 | The signed in pages got sections along the top (and along the bottom on a phone), a Bin that keeps deleted documents for 7 days, folders, sharing, and optional two-step verification. It went online: the website on Vercel, the API on Render, the database on Neon, Redis on Upstash, files on Cloudflare R2, with Google sign-in in production. A Welcome page asks for a name and why you came, an owner page shows totals only, and the Privacy and Terms pages were rewritten to say what Brief really does. |
| Nov 13 | The site moved to briefcontracts.com. Sharing got a time limit (1 hour up to 90 days) with a countdown. A read cut short by a server restart now starts again by itself. A first-time tour points at the real parts of the page and stays open as you move around. Up to five photos make one document, with a page for each. The owner page now has charts, comparisons with the period before, a funnel, counts of how often the demo video is opened and finished, and daily and monthly reports to download. The website's per-person request limit went from 30 to 120 a minute, because moving around Brief used to hit it. The theme button left the signed in pages (it is under Appearance on Profile), and the Dashboard tiles lead to the list of documents. Taps feel quicker: a bar appears at once when a page is on its way, buttons press in, and a document page that jumped about while it loaded (a layout shift of 1.8 on a phone, where under 0.1 is good) now sits still. The README was rewritten. |

Thanks for reading. If something here looks wrong or unclear, please open an issue.
