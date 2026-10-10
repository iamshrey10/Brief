# evals

The evaluation harness. A labeled set of documents and a test suite scoring extraction accuracy,
citation validity, and abstention correctness. The extraction, citation, and abstention parts are
built in week 3 and 4.

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

## Key-terms evaluation

Runs key-term extraction over a loan document and a lease document built from the same fixture,
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
