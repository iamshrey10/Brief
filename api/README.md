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

`/health` says the process is up. `/health/db` checks the database connection. `/health/ready` is the one for a
load balancer: 200 only when the database answers and its migrations are current, 503 otherwise.

## API documentation

While running locally, open http://localhost:8000/docs for the interactive documentation (or `/redoc` to read
it). Every route has a group, a plain summary, a description, and the error answers it can give. A test fails
if a route is added without those, and another checks that the documented errors are the ones its code can
really raise. Production serves none of these pages (`/docs`, `/redoc` and `/openapi.json` all return 404),
because they are a free map of every route.

## Database

Schema is managed with SQLAlchemy models (`app/models.py`) and Alembic migrations
(`migrations/versions/`). After changing a model, generate a new migration:

    .venv/bin/alembic revision --autogenerate -m "describe the change"
    .venv/bin/alembic upgrade head

Requires Postgres with the pgvector extension, already provided by the `docker-compose.yml` at the
repository root.
