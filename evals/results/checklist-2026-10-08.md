# Must-ask checklist evaluation, 2026-10-08

Model under test: `gemini-3.5-flash-lite`.

A loan note (11 clauses) and a lease (12 clauses) written the way real contracts come out of a PDF, with digit numbers, broken lines, a flattened fee table, and filler clauses, each run 3 times with real Gemini and the real quote and number checks. Ground truth was written before any results were seen and not tuned afterward. About a third of the questions are not answered by the text on purpose, including important ones, so inventing an answer is a measurable failure. Each document also has a decoy clause that mentions a topic without answering it, added after a real lease showed the model treating a passing mention as an answer.

## Questions the document answers (39 question-runs)

| Outcome | Count |
|---|---|
| Right clause and right answer | 100% (39/39) |
| Cited a wrong clause | 0% (0/39) |
| Right clause, wrong answer | 0% (0/39) |
| Model said not mentioned | 0% (0/39) |
| Found, then dropped by our checks | 0% (0/39) |

The last row is the cost of our safety checks: the model found the answer but its quote or a number in it did not verify, so a reader sees "not mentioned" instead.

## Questions the document does not answer (21 question-runs)

| Outcome | Count |
|---|---|
| Correctly said not mentioned | 100% (21/21) |
| Invented an answer | 0% (0/21) |

## Gaps and the multi-part answer

- Important questions the document does not answer, flagged as a gap: 100% (12/12).
- The fee question needs two separate quotes. Of the runs that got it right, 100% (3/3) used more than one quote.

## Stability across the repeated runs

Questions whose outcome changed between runs of the same document: 0.

## Latency

Mean 30.1s per document, slowest 58.8s.

## Every miss

None.

## Caveats

- Two documents of 11 and 12 clauses and 20 scored questions is a small sample, one or two questions is not strong evidence.
- The documents are short and written by me. Real contracts are longer, messier, and scanned, and I have not run this on one yet.
- The second check is a model call too. On a real lease it wrongly withheld a correct answer about 1 time in 8 and once gave a different verdict on identical input, so a good answer can show as not mentioned. The "dropped by our checks" row measures that cost, and it was zero on this fixture, which is clean and not a promise about real contracts.
- The free Gemini tier allows 15 requests a minute, and the checklist now makes two calls per document, so the slowest runs here include waiting on that limit.
- Whether an answer is right is judged by words it must contain, not by reading it, so a correct answer phrased unexpectedly would count as wrong, and a sloppy one that happens to contain the words would count as right.
