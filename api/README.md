# api

Backend for Brief. Python 3.12, FastAPI, async.

Ingestion, retrieval, extraction, grounded Q&A, citation verifier, agentic tool calling, eval API.

## Running locally

    python3.12 -m venv .venv
    .venv/bin/pip install -r requirements.txt
    .venv/bin/uvicorn app.main:app --reload

Open http://localhost:8000/health
