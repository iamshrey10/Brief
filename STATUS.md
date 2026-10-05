# Where Brief stands

A plain account of what works today, what is still missing, and how long the rest should take. I
update it every week, so you can hold my pace against my promises.

**Last updated:** October 4, 2026 (day 15 of building)

## The short version

Brief is about **50% of the way** to a finished first version, counting working days: 15 done and about
15 and a half to go. The part that reads a contract and answers questions about it, with a checked quote for every
answer, works end to end. The parts that make it pleasant to use, easy to trust, and available on the
internet are still ahead.

**Expected finish for the core product: around October 30**, with a realistic window of October 19 to
November 4. The extras (Word files, several files at once, sharper photo handling) would add about 4
more working days.

## By the numbers

| | |
|---|---|
| Working days so far | 15 |
| Commits | 65 |
| Tests | 319 (207 backend, 112 frontend), run on every push |
| Lines of code vs lines of tests | about 3,590 vs 4,370 |
| API endpoints | 12 |
| Database tables | 6 |
| Evaluations | 4 (search, question answering, key terms, must-ask checklist) |
| Documents it can read | text PDFs and phone photos or scans (JPG, PNG, HEIC) |
| Largest upload | 50 MB |
| Time to answer a question | about 2.5 seconds on average |
| Time to read a whole document (key terms or the checklist) | about 3 to 6 seconds |

## What works today

- **Sign in** with Google, and every request checked twice, once in the web app and once in the API.
- **Upload** a PDF or a photo of a page. Scans get cleaned up and read, and a blurry one is flagged
  instead of quietly accepted.
- **Clause splitting.** A contract is cut into its real numbered clauses, not arbitrary pieces.
- **Search** that mixes keyword and meaning-based matching.
- **Ask a question and get a checked answer.** Each answer points to the clause it came from, and it only
  appears if the quote really is in the document. If the document does not say, Brief says that.
- **A chat screen** where clicking a citation jumps to the clause and highlights the exact words.
- **Key terms** such as the interest rate, fees, and dates, each with its quote. Backend only for now,
  there is no screen for it yet.
- **Must-ask questions.** For a loan, lease, or job offer, Brief answers the questions people most
  often skip, each with the exact quotes behind it, or says the document does not answer it. An
  important question left unanswered is flagged as a gap, with wording for asking the other side. An
  answer can rest on up to three separate passages, and a second, independent check confirms that the
  quoted text really answers the question and does not just mention the topic. Backend only for now.

## What is left

I count effort in working days, meaning a focused session like the ones so far. The second half is
heavier on polish and proof than the first.

| Piece | Estimate | Status |
|---|---|---|
| Must-ask questions and "what this contract leaves out" | 1 day on the backend, done | Backend finished Oct 4, the screen is in the next row |
| An "at a glance" screen for key terms and questions | 2 days | Next up |
| Design polish: dashboard, phone layout, dark mode, loading and empty states | 2 days | Not started |
| An agent step that retries a weak search or checks a term against typical terms | 2 to 3 days | Not started |
| A larger test set, with a build that fails if quality drops | 2 days | Not started |
| Tracing, so every answer can be inspected afterwards | 1 day | Not started |
| Putting the backend online | 2 days | Not started |
| Hardening: delete-my-data, limits, error handling, a security pass | 2 days | Not started |
| README, diagrams, and a short demo | 2 days | Not started |
| **Core total still to go** | **about 15 and a half days** (range 12 to 19) | |
| Word (.docx) files | 1 day | Last |
| Several files in one upload | 2 days | Last |
| Sharper handling of low quality photos | 1 day | Last |
| **Extras total** | **about 4 days** | |

## How long, in calendar time

At five working days a week, 15 and a half days would end around October 26. I add a quarter on top for
the things that always go wrong, which lands around October 30, so call it **about October 30**. A fast
run at six days a week could finish near October 19, and a slow one at four days a week would reach
November 4. Adding the extras moves each of those by about a week. The date moved a little earlier
since last time, because the must-ask backend took one working day instead of the two I had planned.

These are estimates, not promises. I will say so in the update log if they move.

## Where I am unsure

- **The test sets are small.** The 24 search questions, the 32 answer questions, and the key-terms
  check are all short, clean examples. The scores on them (96% right clause first, 24 of 24 cited
  correctly, 8 of 8 correctly declined) are not a claim about contracts in general.
- **Real documents are messier.** On one real three-page lease, key-term extraction found 8 of 12
  fields in about 3 seconds. One was found and then rejected by my own checks, because the model
  joined two separate lines into one quote, and key terms still cannot rest on several passages the
  way the must-ask answers now can. I have not yet confirmed whether the other three are genuinely
  absent.
- **The must-ask answers needed a second check.** On the same lease, the model twice treated a
  clause that only named a fee as if it answered the question, which would have hidden a real gap. The
  second check removed that, but it is a model too: on the lease it wrongly withheld a good answer
  about 1 time in 8, and it once changed its verdict on identical input. A withheld answer shows as
  "not mentioned" with wording to ask the other side, which I chose over showing a wrong answer.
- **Keyword search is weak.** It scored 4% on its own, so search is really relying on meaning-based
  matching for now. My test set has no exact-term questions, so I cannot yet say how it does on those.
- **Reranking made things worse** (67% against 96%), so it is switched off by default.
- **Free quotas.** The free Gemini tier caps some models at 20 requests a day, and the model I use at
  15 requests a minute. The must-ask checklist now makes two calls per document, so a few people at
  once would hit that. Putting this online for other people will probably need a paid plan.
- **The slowest answer took 41 seconds.** I have not looked into why.
- **Phone layout and dark mode** have not been checked yet.

## Update log

| Date | What changed |
|---|---|
| Oct 3 | First version of this page. Key-term extraction finished on the backend. 49 commits, 242 tests. |
| Oct 4 | Must-ask questions finished on the backend, with a second check on the answers. The expected finish moved from about November 1 to about October 30. 65 commits, 319 tests. |

Thanks for reading. If something here looks wrong or unclear, please open an issue.
