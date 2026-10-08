# Where Brief stands

A plain account of what works today, what is still missing, and how long the rest should take. I
update it every week, so you can hold my pace against my promises.

**Last updated:** October 8, 2026 (day 19 of building)

## The short version

Brief is about **60% of the way** to a finished first version, counting working days: 19 done and about
12 to go. You can upload a contract, see its key terms and the questions it leaves unanswered on one
screen, ask questions, and get an answer with a checked quote. The parts still ahead are putting it
online, proving its quality automatically on every change, and making its results steadier.

**Expected finish for the core product: around October 30**, with a realistic window of October 19 to
November 4. The extras (Word files, several files at once, sharper photo handling) would add about 4
more working days.

## By the numbers

| | |
|---|---|
| Working days so far | 19 |
| Commits | 116 |
| Tests | 810 (393 backend, 417 frontend), run on every push |
| Lines of code vs lines of tests | about 5,900 vs 11,100 (tests count the evaluation scripts) |
| API endpoints | 16 |
| Database tables | 6 |
| Evaluations | 4 (search, question answering, key terms, must-ask checklist) |
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

## What is left

I count effort in working days, meaning a focused session like the ones so far. The second half is
heavier on polish and proof than the first.

| Piece | Estimate | Status |
|---|---|---|
| Key terms, must-ask questions, the Overview screen, the dashboard, delete and edit, limits | done | Finished Oct 5 to 8 |
| Steadier results | done on one real lease | Voted reads and a second check that judges each answer alone, to be re-measured on more documents |
| An agent step that retries a weak search or checks a term against typical terms | 2 to 3 days | Not started |
| A larger test set, with a build that fails if quality drops | 2 days | Not started |
| An automatic click-through test of the screens in a real browser | 1 day | Not started |
| Tracing, so every answer can be inspected afterwards | 1 day | Not started |
| Putting the backend online | 2 days | Not started |
| Hardening: the rest of the error handling and a security pass | 1 day | Partly done (limits, delete) |
| README, diagrams, and a short demo | 2 days | Not started |
| **Core total still to go** | **about 11 and a half days** (range 10 to 16) | |
| Word (.docx) files | 1 day | Last |
| Several files in one upload | 2 days | Last |
| Sharper handling of low quality photos | 1 day | Last |
| **Extras total** | **about 4 days** | |

## How long, in calendar time

At five working days a week, 11 and a half days from October 9 would end around October 26. I add a
quarter on top for the things that always go wrong, which lands around October 30, so call it **about
October 30**. A fast
run at six days a week could finish near October 19, and a slow one at four days a week would reach
November 4. Adding the extras moves each of those by about a week. The date did not move since last time: the
screens and the dashboard took about the time I planned, and I added work I had not planned, such as
delete and edit, reasons a read fails, limits, and read progress.

These are estimates, not promises. I will say so in the update log if they move.

## Where I am unsure

- **The test sets are small.** The 24 search questions, the 32 answer questions, and the key-terms
  check are all short, clean examples. The scores on them (96% right clause first, 24 of 24 cited
  correctly, 8 of 8 correctly declined) are not a claim about contracts in general.
- **Real documents are messier.** Key terms still cannot rest on several separate passages the way the
  must-ask answers can, so a fact spread over two lines can show as not mentioned. I have not yet
  confirmed which terms a real lease genuinely lacks, because that needs me to read the whole lease.
- **Steadier is not the same as more accurate.** On one real 36 clause lease, four unseeded reads of the
  key terms changed four fields between runs and four voted reads changed none. Six runs of the
  must-ask questions gave the same two answers every time, after I changed the second check to judge
  each answer alone: judged in a group, it had steadily left out the lease's deposit, which it
  confirms every time on its own. That is one lease, not a general claim. Voting costs time: a document
  now makes ten or more model calls and can take from a few seconds to about a minute on the free tier.
- **Keyword search is weak.** It scored 4% on its own, so search is really relying on meaning-based
  matching for now. My test set has no exact-term questions, so I cannot yet say how it does on those.
- **Reranking made things worse** (67% against 96%), so it is switched off by default.
- **Free quotas.** The free Gemini tier caps some models at 20 requests a day, and the model I use at
  15 requests a minute. Reading one document now takes ten or more calls, so a few people at once
  would hit that. Putting this online for other people will probably need a paid plan.
- **The slowest answer took 41 seconds.** I have not looked into why.
- **Phone layout and dark mode** were checked on the Overview and the dashboard on October 5, not yet on
  the newer buttons and failure messages.

## Update log

| Date | What changed |
|---|---|
| Oct 3 | First version of this page. Key-term extraction finished on the backend. 49 commits, 242 tests. |
| Oct 4 | Must-ask questions finished on the backend, with a second check on the answers. The expected finish moved from about November 1 to about October 30. 65 commits, 319 tests. |
| Oct 8 | The Overview screen and a real dashboard shipped, with delete, edit, read again, reasons a read fails, limits, and read progress. Key terms and questions are now read three times and kept by vote, which made them steadier but not more accurate. 116 commits, 810 tests. The finish stays about October 30. |

Thanks for reading. If something here looks wrong or unclear, please open an issue.
