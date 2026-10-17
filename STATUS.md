# Where Brief stands

A plain account of what works today, what is still missing, and how long the rest should take. I
update it every week, so you can hold my pace against my promises.

**Last updated:** October 16, 2026 (day 27 of building)

## The short version

Brief is about **75% of the way** to a finished first version, counting working days: 27 done and about
9 to go. You can upload a contract, see its key terms and the questions it leaves unanswered on one
screen, ask questions, and get an answer with a checked quote. The parts still ahead are putting it
online, a bigger test set, tracing every answer, and a step that retries a weak search.

**Expected finish for the core product: around October 30**, with a realistic window of October 26 to
November 5. The extras (Word files, several files at once, sharper photo handling) would add about 4
more working days.

## By the numbers

| | |
|---|---|
| Working days so far | 27 |
| Commits | 240 |
| Tests | 1,377 (718 backend, 643 frontend, 16 in a real browser), run on every push |
| Lines of code vs lines of tests | about 6,900 vs 16,600 (tests count the evaluation scripts) |
| API endpoints | 19 |
| Database tables | 7 |
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
  message ends with a short `Reference` code that finds it. A health check says whether the server can do real
  work, not just whether it is running. Browser tests check what a visitor who is not signed in can reach.
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
| A larger test set, with a build that fails if quality drops | 1 day | The build already fails on a drop; the test set is still small |
| An automatic click-through test of the screens in a real browser | 0.5 day | Done for pages anyone can reach (16 tests); the signed in screens need a stand-in for Google sign in |
| Tracing, so every answer can be inspected afterwards | 0.75 day | Started: request ids and reference codes exist, the record of what each answer used does not |
| Putting the backend online | 2 days | Not started; the images and a readiness check are ready |
| Hardening: a browser test of delete account and upload checks, then a security pass once it is online | 0.5 day | Mostly done (limits, delete, upload checks, secrets, dependency scan) |
| README, diagrams, and a short demo | 1.75 days | README kept current as I go; diagrams and demo not started |
| **Core total still to go** | **about 9 days** (range 8 to 13) | |
| Word (.docx) files | 1 day | Last |
| Several files in one upload | 2 days | Last |
| Sharper handling of low quality photos | 1 day | Last |
| **Extras total** | **about 4 days** | |

## How long, in calendar time

At five working days a week, 9 days from Monday October 19 would end around October 29. I add a
quarter on top for the things that always go wrong, which lands around October 30, so call it **about
October 30**. A fast run at six days a week could finish near October 26, and a slow one at four days a
week would reach November 5. A first version people can try, which only needs the backend online, could be
up around October 22. Adding the extras moves each of those by about a week. The date did not move since
last time: the days I spent on work that was not in the list, such as daily limits, the readiness check,
request ids, and browser tests, were partly the tracing and click-through items under another name.

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
- **Phone layout** was checked by hand on October 13 on the dashboard, the Overview and Ask, and an automatic
  test now checks the landing page. The newer failure messages with a reference code were tested in code, not
  yet looked at on a phone.
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

Thanks for reading. If something here looks wrong or unclear, please open an issue.
