# Where Brief stands

A plain account of what works today, what is still missing, and how long the rest should take. I
update it every week, so you can hold my pace against my promises.

**Last updated:** October 21, 2026 (day 32 of building)

## The short version

Brief is about **80% of the way** to a finished first version, counting working days: 32 done and about
7 to go. You can upload a contract, see its key terms and the questions it leaves unanswered on one
screen, ask questions, and get an answer with a checked quote. The parts still ahead are putting it
online, a step that retries a weak search, a bigger test set, and a demo.

**Expected finish for the core product: around November 3**, with a realistic window of October 28 to
November 9. **That is four days later than I said last week, and the reason is in the calendar section.** The extras (Word files, several files at once, sharper photo handling) would add about 4
more working days.

## By the numbers

| | |
|---|---|
| Working days so far | 32 |
| Commits | 313 |
| Tests | 1,588 (805 backend, 695 frontend, 88 in a real browser), run on every push |
| Lines of code vs lines of tests | about 7,300 vs 19,200 (tests count the evaluation scripts and the browser test helpers) |
| API endpoints | 19 |
| Database tables | 8 |
| Evaluations | 5 (search, question answering, key terms, must-ask checklist, steadiness) |
| Documents it can read | text PDFs and phone photos or scans (JPG, PNG, HEIC) |
| Limits | 50 MB a file, 25 documents a person, 100 pages a document |
| Time to answer a question | about 2.5 seconds on average |
| Time to read a whole document (key terms or the checklist) | about 10 and 30 seconds on my test documents, since each is now read three times |

## What works today

- **Sign in** with Google, and every request checked twice, once in the web app and once in the API.
- **Upload** a PDF or a photo of a page. Scans get cleaned up and read, and a blurry one is flagged
  instead of quietly accepted.
- **Clause splitting.** A contract is cut into its real numbered clauses, not arbitrary pieces.
- **Search** that mixes keyword and meaning-based matching.
- **Ask a question and get a checked answer.** Each answer points to the clause it came from, and it only
  appears if the quote really is in the document. If the document does not say, Brief says that.
- **A chat screen** where clicking a citation jumps to the clause and highlights the exact words.
- **Key terms** such as the interest rate, fees, and dates, each with its quote, on an Overview screen
  next to the document. Clicking one jumps to the clause and highlights the exact words.
- **Must-ask questions.** For a loan, lease, or job offer, Brief answers the questions people most
  often skip, each with the exact quotes behind it, or says the document does not answer it. An
  important question left unanswered is flagged as a gap, with wording for asking the other side. An
  answer can rest on up to three separate passages, and a second, independent check confirms that the
  quoted text really answers the question and does not just mention the topic. They show on the same
  Overview screen, with a Copy button for the wording.
- **A dashboard** with drag and drop upload, a list of your documents, and a way to rename, change the
  kind of, delete, or read again each one. A document that fails says why in plain words, and a long one
  shows how far it has got. It works in dark mode and at phone width.
- **Steadier results.** The key terms and the questions are each read three times with fixed seeds and
  kept by vote, because the same contract read twice used to come out differently.
- **Easier to debug.** Every call carries a request id that appears in every log line it causes, and a failure
  message ends with a short `Reference` code that finds it. Each question also saves what it used (which clauses
  the model saw and which it cited, ids only, never text), and one command prints it for a reference code. A
  health check says whether the server can do real work, not just whether it is running.
- **Checked in a real browser.** 88 automatic browser tests cover the pages anyone can reach and, signed in
  with a sign in that exists only outside production, uploading, renaming, Read again, Try again, delete,
  sign out, asking and clicking a source, at phone width too, and an accessibility scan of every main screen
  and of the states with something open or an error showing. They found and fixed a missing main landmark,
  button names that did not contain their visible words, error text that was too faint in light mode, and a
  heading level that was skipped.
- **The API describes itself.** Every route has a group, a plain summary and the errors it can give, checked by
  a test against the code, at `/docs` while building and not on a live server.
- **Security basics.** Uploads are checked against what the file really is, tokens must expire, the
  servers refuse weak secrets in production, you can delete your account and everything in it, and a
  scan of the libraries runs weekly. The README's Security section lists what is and is not covered.

## What is left

I count effort in working days, meaning a focused session like the ones so far. The second half is
heavier on polish and proof than the first.

| Piece | Estimate | Status |
|---|---|---|
| Key terms, must-ask questions, the Overview screen, the dashboard, delete and edit, limits | done | Finished Oct 5 to 8 |
| Steadier results | 0.5 day | Voted reads help on three real leases but not fully on the longest, and I still cannot say whether the voted questions are right |
| An agent step that retries a weak search or checks a term against typical terms | 2 to 3 days | Not started |
| A larger test set, with a build that fails if quality drops | 0.5 day | The build already fails on a drop and the question set grew to 50, ten of them near misses; it is still one short fixture |
| An automatic click-through test of the screens in a real browser | done | 57 browser tests, signed in too, covering upload, rename, Read again, Try again, delete and sign out, using a sign in that exists only outside production and a fake API; still not the real API or Google |
| Tracing, so every answer can be inspected afterwards | 0.25 day | Mostly done: request ids, reference codes and a saved record of what each question used, found by a script. Not built: a screen for looking at it |
| Putting the backend online | 1.75 days | Not started. Ready: the images, a readiness check, example settings files, a script for the storage rules, and a checklist. Needs your choice of host and whether to pay for Gemini |
| Hardening: a browser test of delete account and upload checks, then a security pass once it is online | 0.5 day | Mostly done (limits, delete, upload checks, secrets, dependency scan) |
| README, diagrams, and a short demo | 1.5 days | README kept current as I go; diagrams and demo not started |
| **Core total still to go** | **about 7 days** (range 6 to 11) | |
| Word (.docx) files | 1 day | Last |
| Several files in one upload | 2 days | Last |
| Sharper handling of low quality photos | 1 day | Last |
| **Extras total** | **about 4 days** | |

## How long, in calendar time

At five working days a week, 7 days from Thursday October 22 would end around October 30. I add a quarter on
top for the things that always go wrong, which lands around November 3, so call it **about November 3**. A
fast run at six days a week could finish near October 29, and a slow one at four days a week would reach
November 9. Adding the extras moves each of those by about a week. A first version people can try only needs
the backend online, which is about two days of work once you have chosen a host and decided about paying for
Gemini, so it could be up around October 26.

**Why the date moved.** Last week I said October 30. Since then five working days went on things that were not
in the list: an accessibility pass over every screen (it found real problems), documentation of the API that is
checked against the code, deployment preparation, and many more browser tests than I planned. I counted those
days as done, which is why the percentage rose faster than the list shrank, and the finish moved by about as
many days as they took. The list of what is left did not grow.

These are estimates, not promises. I will say so in the update log if they move.

## Where I am unsure

- **The test sets are small.** The 24 search questions, the 50 answer questions (32 with an answer, 18
  without), and the key-terms check are all short, clean examples on a 17 clause fixture. The scores on them
  (96% right clause first, 32 of 32 cited correctly, 18 of 18 correctly declined) are not a claim about
  contracts in general. The 18 include ten near misses, where the topic is in a clause but the fact asked for
  is not. One of those was replaced after the first run because I had written it ambiguously: the model
  answered with the fact the clause does state, which was not wrong. That first run scored 17 of 18.
- **Real documents are messier.** Key terms can now rest on up to three checked quotes, so a fact spread
  over two sentences (a deposit amount and its refund rule) is no longer dropped. On my sample lease the
  deposit is now found, 8 of 12 terms instead of 7. That is one lease, and I have not yet confirmed which
  terms a real lease genuinely lacks, because that needs me to read the whole lease.
- **Steadier is not the same as more accurate.** On three real leases, the voted key terms changed 0, 0
  and 2 fields between runs, where one unseeded read changed 4, 5 and 5, so voting helps but did not
  fully steady the longest lease (286 pieces). The voted questions gave the same answers in every run on
  all three. On the longest lease they answer 5 questions where one unseeded read answered 6 to 9, and I
  have not read that lease to say which is right: the voted version may be stricter, or the single read
  may have been counting passing mentions. Judging each answer alone mattered: judged in a group, the
  second check had steadily left out a lease's deposit that it confirms every time on its own. Voting
  costs time: a document now makes ten or more model calls and can take from a few seconds to about a
  minute on the free tier. Three leases and a handful of runs is a check, not a general claim.
- **Keyword search is weak.** It scored 4% on its own, so search is really relying on meaning-based
  matching for now. My test set has no exact-term questions, so I cannot yet say how it does on those.
- **Reranking made things worse** (67% against 96%), so it is switched off by default.
- **Free quotas.** The free Gemini tier caps some models at 20 requests a day, and the model I use at
  15 requests a minute. Reading one document now takes ten or more calls, so a few people at once
  would hit that. Putting this online for other people will probably need a paid plan.
- **The slowest answer took 41 seconds.** I have not looked into why.
- **Nothing is online yet.** The container images build and the readiness check works against my local
  database, but I have not run any of it on a real host. Real hosting usually surfaces surprises, so that part
  of the estimate is the least certain.
- **The browser tests use a fake API.** It checks tokens like the real one and refuses what the real one
  would, but it is not the real one, so they show the website behaves correctly given those answers, not that
  the real API gives them. The accessibility scans find what a machine can detect, which is only part of the
  problems, so a person should still try the screens with a keyboard and a screen reader. I have not yet
  looked at the newest screens on a real phone.
- **Build tools** have one known high severity report with no fixed version yet. It is not part of what
  ships.

## Update log

| Date | What changed |
|---|---|
| Oct 3 | First version of this page. Key-term extraction finished on the backend. 49 commits, 242 tests. |
| Oct 4 | Must-ask questions finished on the backend, with a second check on the answers. The expected finish moved from about November 1 to about October 30. 65 commits, 319 tests. |
| Oct 8 | The Overview screen and a real dashboard shipped, with delete, edit, read again, reasons a read fails, limits, and read progress. Key terms and questions are now read three times and kept by vote, which made them steadier but not more accurate. 116 commits, 810 tests. The finish stays about October 30. |
| Oct 10 | Security work: uploads are checked against what the file really is, tokens must expire, both servers refuse weak secrets in production, a dependency scan found and fixed 10 real vulnerabilities and now runs weekly, and you can delete your account and everything in it. Steadiness was measured on two more real leases. 152 commits, 1,003 tests. The finish stays about October 30. |
| Oct 16 | Daily limits, abandoned upload cleanup, timing of every model call, and a build that fails if a recorded quality score drops (Oct 11 to 12). A browser test of the whole app by hand found a rate limit failure with nothing in the log, a deposit missing from key terms, and one tap sign in; each was fixed, and a key term can now rest on up to three checked quotes (Oct 13). Browser tests of the pages anyone can reach, a health check that says whether the server can do real work, request ids, and a short reference code on failure messages (Oct 14 to 16). 240 commits, 1,377 tests. About 75 percent, finish still around October 30. |
| Oct 21 | Answer traces (what each question used, ids only, found from a reference code), documentation of every route checked against the code, example settings files, a script for the storage upload rules, a deployment checklist, and a test-only sign in with a fake API that lets the signed in screens be tested in a real browser: 88 browser tests, accessibility scans of every main screen and state, and four real problems they found fixed. 313 commits, 1,588 tests. About 80 percent, and the finish moved from about October 30 to about November 3 for the reason given above. |

Thanks for reading. If something here looks wrong or unclear, please open an issue.
