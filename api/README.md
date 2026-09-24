# api

Backend for Brief. Python 3.12, FastAPI, async.

Ingestion, retrieval, extraction, grounded Q&A, citation verifier, agentic tool calling, eval API.

## Running locally

    python3.12 -m venv .venv
    .venv/bin/pip install -r requirements.txt
    cp .env.example .env
    .venv/bin/alembic upgrade head
    .venv/bin/uvicorn app.main:app --reload

Open http://localhost:8000/health and http://localhost:8000/health/db

## Database

Schema is managed with SQLAlchemy models (`app/models.py`) and Alembic migrations
(`migrations/versions/`). After changing a model, generate a new migration:

    .venv/bin/alembic revision --autogenerate -m "describe the change"
    .venv/bin/alembic upgrade head

Requires Postgres with the pgvector extension, already provided by the `docker-compose.yml` at the
repository root.
