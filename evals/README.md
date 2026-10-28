# evals

The evaluation harness. Labeled documents and scripts that score search, question answering (right
citation, correct abstention), key term extraction, the must-ask checklist, and how steady the results
are from one read to the next. Each script writes a dated report to `results/`, and
`check_results.py` holds the latest reports to the limits in `thresholds.json`, which CI runs.

## Retrieval evaluation

Scores each search strategy on how often it puts the right clause first, over a small labeled
fixture of questions and clauses (`retrieval_fixture.py`). Compares keyword search, vector search,
hybrid, and hybrid plus a cross-encoder rerank.

It uses real Gemini embeddings and a real Postgres, so it needs both available, and a real
`GEMINI_API_KEY` in `api/.env`. It builds a temporary document, scores it, and deletes it.

    cd api && PYTHONPATH=. python ../evals/retrieval_eval.py

Each run writes a dated report to `results/`. The fixture was written before any results were seen
and is not tuned to the strategies it measures.

## Grounded Q&A evaluation

Runs the full question-answering pipeline (retrieval, Gemini, and the citation check) over the
same fixture plus questions the document cannot answer. Scores whether it cites the right clause
on answerable questions, and whether it says it couldn't find the answer on unanswerable ones.

It makes one real Gemini call per question. The free tier caps requests per day per model, so
the model under test can be swapped, and the report records which one it measured:

    cd api && QA_EVAL_MODEL=gemini-3.5-flash-lite PYTHONPATH=. python ../evals/qa_eval.py

It runs over one of two labeled documents, chosen with `QA_EVAL_FIXTURE` (see `eval_fixtures.py`). Each has questions
the document answers and questions it does not, including near misses where the topic is in a clause but the fact asked
for is not, and each writes its own report:

    cd api && QA_EVAL_FIXTURE=offer QA_EVAL_MODEL=gemini-3.5-flash-lite PYTHONPATH=. python ../evals/qa_eval.py

| Fixture | Document | Answerable | Unanswerable | Report |
|---|---|---|---|---|
| `loan-lease` (the default) | 17 clauses of a mixed loan and lease | 32 | 18 | `results/qa-<date>.md` |
| `offer` | 17 clauses of a job offer | 25 | 18 | `results/qa-offer-<date>.md` |
| `loan` | 17 clauses of an education loan | 24 | 18 | `results/qa-loan-<date>.md` |

The quality gate holds `loan-lease` and `offer` to the same limits. `loan` is measured but **not gated yet**: its first run (23 of 24
right, 17 of 18 declined) had one over refusal and one nearest fact answer, and its report says what to change before it is held to
the limits. On October 27 the answering instruction gained a rule for "which one" questions. The loan fixture then scored 22 of 24
right and 18 of 18 declined with an extra arithmetic rule (since removed, it did not help and cost an answer on the loan and lease
fixture), and 21 of 24 and 17 of 18 with only the "which one" rule, so its score moves by one or two between runs and it stays outside
the gate until it holds. The loan and lease and job offer fixtures stayed at 100 percent both times. The job offer is also part of the key terms evaluation (57 of 60 right, the three misses being one label that was too
narrow, see its report). Questions are written before any result is seen for them. If a question
turns out to be ambiguous it is replaced in the open: the note at the top of the fixture and the report say so, and the
first result is kept. Twice now a near miss question asking for one specific detail was answered with the nearest
related fact; the second time the question was left as written and the answering instruction was changed instead (see
`qa-offer-2026-10-22.md`).

## Key-terms evaluation

Runs key-term extraction over a loan document and a lease document built from the same fixture, and a job offer,
three times each, and scores two things: whether each term the document states is found with the
right clause and value, and whether the terms it does not state come back as "not mentioned"
instead of an invented value. Most fields are not stated on purpose. It also records what the
model said before our quote and number checks ran, so a miss can be told apart: the model not
finding a term, or our checks rejecting a correct one.

Eighteen real Gemini calls (six extractions, each now the vote of three seeded reads). The model under test can be swapped with `KEY_TERMS_EVAL_MODEL`:

    cd api && PYTHONPATH=. python ../evals/key_terms_eval.py

The ground truth in `key_terms_fixture.py` was written before any results were seen and is not
tuned to them.

## Steadiness evaluation

Reads one real, already read document several times two ways and counts how many fields changed
between runs: one unseeded read per run (how it worked before the votes), and the voted read the app
uses now. It covers the key terms and the must-ask questions. Nothing is saved.

    cd api && PYTHONPATH=. python ../evals/steadiness_eval.py <document-id> <loan|lease|offer|other> <runs> <label>

The document is a real private one, so the report in `results/` records only field and question ids
and counts, never a value, a quote or a file name. Fewer changes means steadier, not more accurate,
and one document is not a general result. Real documents have not been read by a person here to say
which answers are right.

The free Gemini tier allows 15 requests a minute, and a voted read makes about ten, so a run takes
minutes and the script waits out rate limits the way the app does not.

## The quality gate

`check_results.py` reads the newest committed report of each evaluation and fails the build if a number
is below its minimum in `thresholds.json` (or above its maximum, for the bad outcomes, which must stay at
zero). It needs no model and no secret, and CI runs it on every push.

    python evals/check_results.py

It checks the committed reports. So a change that makes answers worse is caught when the evaluations are
run again and their new reports are committed, which is part of changing a prompt or the search: run the
affected evaluation, commit the report it writes, and the gate then judges the new numbers. A report or a
line that is missing is an error and never a pass, and a limit that matches no number, or a number with no
limit, is an error too, so a typo cannot hide a check. The limits are set below today's results on purpose:
they catch a real drop, not noise, and they are not a claim about contracts in general.
