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
