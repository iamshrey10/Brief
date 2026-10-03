import uuid

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

import app.main as main_module
from app.auth import get_current_user
from app.key_terms import ExtractedField, ExtractionResponse, KeyTermsGenerationError
from app.main import app
from app.models import EMBEDDING_DIM, Clause, Document, Embedding, User
from app.qa import AnswerGenerationError, AnswerResult, CitedClause


@pytest_asyncio.fixture
async def client(test_user, monkeypatch):
    async def override_get_current_user():
        return test_user

    # Ingestion itself is covered in test_ingestion.py; here we only care that the
    # endpoint schedules it and returns, not that it actually runs against real R2/Gemini.
    monkeypatch.setattr(main_module, "ingest_document", lambda document_id: None)

    app.dependency_overrides[get_current_user] = override_get_current_user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as async_client:
        yield async_client

    app.dependency_overrides.clear()


async def test_create_upload_returns_presigned_url_and_pending_document(client, db_session):
    response = await client.post(
        "/documents",
        json={
            "filename": "lease.pdf",
            "doc_type": "lease",
            "content_type": "application/pdf",
            "file_size_bytes": 1024,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["upload_url"]

    document = await db_session.get(Document, uuid.UUID(body["document_id"]))
    assert document is not None
    assert document.status == "pending"
    assert document.doc_type == "lease"


async def test_create_upload_rejects_unknown_doc_type(client):
    response = await client.post(
        "/documents",
        json={
            "filename": "lease.pdf",
            "doc_type": "not-a-real-type",
            "content_type": "application/pdf",
            "file_size_bytes": 1024,
        },
    )

    assert response.status_code == 400


async def test_create_upload_rejects_oversized_file(client):
    response = await client.post(
        "/documents",
        json={
            "filename": "lease.pdf",
            "doc_type": "lease",
            "content_type": "application/pdf",
            "file_size_bytes": 100 * 1024 * 1024,
        },
    )

    assert response.status_code == 400


async def test_create_upload_rejects_unsupported_content_type(client):
    response = await client.post(
        "/documents",
        json={
            "filename": "lease.exe",
            "doc_type": "lease",
            "content_type": "application/x-msdownload",
            "file_size_bytes": 1024,
        },
    )

    assert response.status_code == 400


async def test_confirm_upload_marks_document_uploaded_and_triggers_ingestion(
    client, db_session, test_user, monkeypatch
):
    calls: list[uuid.UUID] = []
    monkeypatch.setattr(main_module, "ingest_document", lambda document_id: calls.append(document_id))

    document = Document(
        user_id=test_user.id,
        filename="lease.pdf",
        doc_type="lease",
        status="pending",
        storage_key="fake/key.pdf",
        file_size_bytes=1024,
    )
    db_session.add(document)
    await db_session.commit()
    await db_session.refresh(document)

    response = await client.patch(f"/documents/{document.id}/confirm")

    assert response.status_code == 200
    assert response.json()["status"] == "uploaded"
    assert calls == [document.id]


async def test_confirm_upload_rejects_another_users_document(client, db_session):
    other_user = User(email=f"{uuid.uuid4()}@example.com")
    db_session.add(other_user)
    await db_session.commit()
    await db_session.refresh(other_user)

    document = Document(
        user_id=other_user.id,
        filename="lease.pdf",
        doc_type="lease",
        status="pending",
        storage_key="fake/key.pdf",
        file_size_bytes=1024,
    )
    db_session.add(document)
    await db_session.commit()
    await db_session.refresh(document)

    response = await client.patch(f"/documents/{document.id}/confirm")

    assert response.status_code == 404


async def test_list_documents_only_returns_current_users_documents(client, db_session, test_user):
    other_user = User(email=f"{uuid.uuid4()}@example.com")
    db_session.add(other_user)
    await db_session.flush()  # other_user.id is a client-side default, unset until flush
    mine = Document(
        user_id=test_user.id,
        filename="mine.pdf",
        doc_type="lease",
        status="ready",
        storage_key="fake/mine.pdf",
        file_size_bytes=1024,
    )
    theirs = Document(
        user_id=other_user.id,
        filename="theirs.pdf",
        doc_type="lease",
        status="ready",
        storage_key="fake/theirs.pdf",
        file_size_bytes=1024,
    )
    db_session.add_all([mine, theirs])
    await db_session.commit()

    response = await client.get("/documents")

    assert response.status_code == 200
    filenames = {doc["filename"] for doc in response.json()}
    assert filenames == {"mine.pdf"}


async def test_search_document_returns_matching_clauses(
    client, db_session, test_user, monkeypatch
):
    document = Document(
        user_id=test_user.id,
        filename="lease.pdf",
        doc_type="lease",
        status="ready",
        storage_key="fake/key.pdf",
        file_size_bytes=1024,
    )
    db_session.add(document)
    await db_session.flush()

    clause = Clause(
        document_id=document.id,
        clause_index=0,
        page_number=1,
        char_start=0,
        char_end=50,
        text="The prepayment penalty is waived for early payoff.",
    )
    db_session.add(clause)
    await db_session.flush()
    db_session.add(Embedding(clause_id=clause.id, vector=[0.1] * EMBEDDING_DIM))
    await db_session.commit()

    monkeypatch.setattr("app.retrieval.embed_query", lambda query: [0.1] * EMBEDDING_DIM)

    response = await client.post(
        f"/documents/{document.id}/search", json={"query": "prepayment penalty"}
    )

    assert response.status_code == 200
    results = response.json()
    assert len(results) == 1
    assert results[0]["clause_id"] == str(clause.id)
    assert "prepayment penalty" in results[0]["text"]


async def test_search_document_rejects_a_document_that_is_not_ready(client, db_session, test_user):
    document = Document(
        user_id=test_user.id,
        filename="lease.pdf",
        doc_type="lease",
        status="processing",
        storage_key="fake/key.pdf",
        file_size_bytes=1024,
    )
    db_session.add(document)
    await db_session.commit()
    await db_session.refresh(document)

    response = await client.post(f"/documents/{document.id}/search", json={"query": "anything"})

    assert response.status_code == 409


async def test_search_document_rejects_an_empty_query(client, db_session, test_user):
    document = Document(
        user_id=test_user.id,
        filename="lease.pdf",
        doc_type="lease",
        status="ready",
        storage_key="fake/key.pdf",
        file_size_bytes=1024,
    )
    db_session.add(document)
    await db_session.commit()
    await db_session.refresh(document)

    response = await client.post(f"/documents/{document.id}/search", json={"query": "   "})

    assert response.status_code == 400


async def test_search_document_rejects_another_users_document(client, db_session):
    other_user = User(email=f"{uuid.uuid4()}@example.com")
    db_session.add(other_user)
    await db_session.flush()

    document = Document(
        user_id=other_user.id,
        filename="lease.pdf",
        doc_type="lease",
        status="ready",
        storage_key="fake/key.pdf",
        file_size_bytes=1024,
    )
    db_session.add(document)
    await db_session.commit()
    await db_session.refresh(document)

    response = await client.post(f"/documents/{document.id}/search", json={"query": "anything"})

    assert response.status_code == 404


async def _ready_document(db_session, test_user) -> Document:
    document = Document(
        user_id=test_user.id,
        filename="lease.pdf",
        doc_type="lease",
        status="ready",
        storage_key="fake/key.pdf",
        file_size_bytes=1024,
    )
    db_session.add(document)
    await db_session.commit()
    await db_session.refresh(document)
    return document


async def test_search_document_does_not_rerank_by_default(client, db_session, test_user, monkeypatch):
    calls: list[str] = []

    async def fake_reranked(session, document_id, query, limit):
        calls.append("reranked")
        return []

    async def fake_hybrid(session, document_id, query, limit):
        calls.append("hybrid")
        return []

    monkeypatch.setattr(main_module, "reranked_search", fake_reranked)
    monkeypatch.setattr(main_module, "hybrid_search", fake_hybrid)
    document = await _ready_document(db_session, test_user)

    response = await client.post(f"/documents/{document.id}/search", json={"query": "late fee"})

    assert response.status_code == 200
    assert calls == ["hybrid"]


async def test_search_document_can_opt_in_to_reranking(client, db_session, test_user, monkeypatch):
    calls: list[str] = []

    async def fake_reranked(session, document_id, query, limit):
        calls.append("reranked")
        return []

    async def fake_hybrid(session, document_id, query, limit):
        calls.append("hybrid")
        return []

    monkeypatch.setattr(main_module, "reranked_search", fake_reranked)
    monkeypatch.setattr(main_module, "hybrid_search", fake_hybrid)
    document = await _ready_document(db_session, test_user)

    response = await client.post(
        f"/documents/{document.id}/search", json={"query": "late fee", "rerank": True}
    )

    assert response.status_code == 200
    assert calls == ["reranked"]


async def test_search_document_rejects_an_out_of_range_limit(client, db_session, test_user):
    document = await _ready_document(db_session, test_user)

    too_big = await client.post(
        f"/documents/{document.id}/search", json={"query": "late fee", "limit": 1_000_000}
    )
    too_small = await client.post(
        f"/documents/{document.id}/search", json={"query": "late fee", "limit": 0}
    )

    assert too_big.status_code == 422
    assert too_small.status_code == 422


# --- POST /documents/{id}/ask ---


async def test_ask_document_returns_the_grounded_answer(client, db_session, test_user, monkeypatch):
    async def fake_answer(session, document_id, question):
        return AnswerResult(
            found=True,
            answer="Yes, with no penalty.",
            citations=[
                CitedClause(
                    clause_id=str(uuid.uuid4()),
                    page_number=2,
                    clause_text="The borrower may prepay at any time without penalty.",
                    quote="without penalty",
                )
            ],
        )

    monkeypatch.setattr(main_module, "answer_question", fake_answer)
    document = await _ready_document(db_session, test_user)

    response = await client.post(
        f"/documents/{document.id}/ask", json={"question": "Can I pay early?"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["found"] is True
    assert body["answer"] == "Yes, with no penalty."
    assert body["citations"][0]["page_number"] == 2
    assert body["citations"][0]["quote"] == "without penalty"


async def test_ask_document_rejects_a_document_that_is_not_ready(client, db_session, test_user):
    document = Document(
        user_id=test_user.id,
        filename="lease.pdf",
        doc_type="lease",
        status="processing",
        storage_key="fake/key.pdf",
        file_size_bytes=1024,
    )
    db_session.add(document)
    await db_session.commit()
    await db_session.refresh(document)

    response = await client.post(f"/documents/{document.id}/ask", json={"question": "Anything?"})

    assert response.status_code == 409


async def test_ask_document_rejects_an_empty_question(client, db_session, test_user):
    document = await _ready_document(db_session, test_user)

    response = await client.post(f"/documents/{document.id}/ask", json={"question": "   "})

    assert response.status_code == 400


async def test_ask_document_rejects_an_overlong_question(client, db_session, test_user):
    document = await _ready_document(db_session, test_user)

    response = await client.post(
        f"/documents/{document.id}/ask", json={"question": "a" * 1001}
    )

    assert response.status_code == 422


async def test_ask_document_rejects_another_users_document(client, db_session):
    other_user = User(email=f"{uuid.uuid4()}@example.com")
    db_session.add(other_user)
    await db_session.flush()
    document = Document(
        user_id=other_user.id,
        filename="lease.pdf",
        doc_type="lease",
        status="ready",
        storage_key="fake/key.pdf",
        file_size_bytes=1024,
    )
    db_session.add(document)
    await db_session.commit()
    await db_session.refresh(document)

    response = await client.post(f"/documents/{document.id}/ask", json={"question": "Anything?"})

    assert response.status_code == 404


async def test_ask_document_returns_502_when_the_model_gives_nothing_usable(
    client, db_session, test_user, monkeypatch
):
    async def failing_answer(session, document_id, question):
        raise AnswerGenerationError("model did not return a valid structured answer")

    monkeypatch.setattr(main_module, "answer_question", failing_answer)
    document = await _ready_document(db_session, test_user)

    response = await client.post(f"/documents/{document.id}/ask", json={"question": "Anything?"})

    assert response.status_code == 502


# --- GET /documents/{id} and GET /documents/{id}/clauses ---


async def _add_clause(db_session, document: Document, index: int, page: int, text: str) -> Clause:
    clause = Clause(
        document_id=document.id,
        clause_index=index,
        page_number=page,
        char_start=0,
        char_end=len(text),
        text=text,
    )
    db_session.add(clause)
    await db_session.flush()
    return clause


async def test_get_document_returns_its_summary(client, db_session, test_user):
    document = await _ready_document(db_session, test_user)

    response = await client.get(f"/documents/{document.id}")

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == str(document.id)
    assert body["filename"] == "lease.pdf"
    assert body["status"] == "ready"


async def test_get_document_rejects_another_users_document(client, db_session):
    other_user = User(email=f"{uuid.uuid4()}@example.com")
    db_session.add(other_user)
    await db_session.flush()
    document = Document(
        user_id=other_user.id,
        filename="theirs.pdf",
        doc_type="lease",
        status="ready",
        storage_key="fake/key.pdf",
        file_size_bytes=1024,
    )
    db_session.add(document)
    await db_session.commit()
    await db_session.refresh(document)

    response = await client.get(f"/documents/{document.id}")

    assert response.status_code == 404


async def test_get_document_returns_404_for_a_malformed_id(client):
    response = await client.get("/documents/not-a-uuid")

    assert response.status_code == 404


async def test_list_clauses_returns_them_in_document_order_with_page_numbers(
    client, db_session, test_user
):
    document = await _ready_document(db_session, test_user)
    # inserted out of order on purpose, the endpoint must sort by clause_index
    second = await _add_clause(db_session, document, 1, 2, "Second clause, on page two.")
    first = await _add_clause(db_session, document, 0, 1, "First clause, on page one.")
    await db_session.commit()

    response = await client.get(f"/documents/{document.id}/clauses")

    assert response.status_code == 200
    clauses = response.json()
    assert [c["id"] for c in clauses] == [str(first.id), str(second.id)]
    assert [c["page_number"] for c in clauses] == [1, 2]
    assert clauses[0]["text"] == "First clause, on page one."


async def test_list_clauses_returns_an_empty_list_for_a_document_with_none(
    client, db_session, test_user
):
    document = await _ready_document(db_session, test_user)

    response = await client.get(f"/documents/{document.id}/clauses")

    assert response.status_code == 200
    assert response.json() == []


async def test_list_clauses_rejects_another_users_document(client, db_session):
    other_user = User(email=f"{uuid.uuid4()}@example.com")
    db_session.add(other_user)
    await db_session.flush()
    document = Document(
        user_id=other_user.id,
        filename="theirs.pdf",
        doc_type="lease",
        status="ready",
        storage_key="fake/key.pdf",
        file_size_bytes=1024,
    )
    db_session.add(document)
    await db_session.flush()
    await _add_clause(db_session, document, 0, 1, "A clause that is not yours to read.")
    await db_session.commit()
    await db_session.refresh(document)

    response = await client.get(f"/documents/{document.id}/clauses")

    assert response.status_code == 404


# --- GET /documents/{id}/key-terms ---

LEASE_RENT_TEXT = "Monthly rent is $2,054.00, due on the first day of each month."


def _fake_key_term_model(monkeypatch, calls: list):
    def fake_generate(fields, clauses):
        calls.append(clauses)
        return ExtractionResponse(
            fields=[
                ExtractedField(
                    name="monthly_rent",
                    found=True,
                    value="$2,054.00 a month",
                    clause_ref="C1",
                    quote="Monthly rent is $2,054.00",
                )
            ]
        )

    monkeypatch.setattr("app.key_terms.generate_key_terms", fake_generate)


async def test_key_terms_returns_verified_terms_and_reuses_them(
    client, db_session, test_user, monkeypatch
):
    document = await _ready_document(db_session, test_user)
    clause = await _add_clause(db_session, document, 0, 2, LEASE_RENT_TEXT)
    await db_session.commit()
    calls: list = []
    _fake_key_term_model(monkeypatch, calls)

    first = await client.get(f"/documents/{document.id}/key-terms")
    second = await client.get(f"/documents/{document.id}/key-terms")

    assert first.status_code == 200
    body = first.json()
    assert body["truncated"] is False
    rent = next(t for t in body["terms"] if t["name"] == "monthly_rent")
    assert rent == {
        "name": "monthly_rent",
        "label": "Monthly rent",
        "found": True,
        "value": "$2,054.00 a month",
        "clause_id": str(clause.id),
        "page_number": 2,
        "quote": "Monthly rent is $2,054.00",
    }
    deposit = next(t for t in body["terms"] if t["name"] == "security_deposit")
    assert deposit["found"] is False and deposit["value"] is None
    assert second.json() == body
    assert len(calls) == 1  # the second request used the saved copy


async def test_key_terms_rejects_a_document_that_is_not_ready(client, db_session, test_user):
    document = await _ready_document(db_session, test_user)
    # It has text, so only its status can be the reason it is refused.
    await _add_clause(db_session, document, 0, 1, LEASE_RENT_TEXT)
    document.status = "processing"
    await db_session.commit()

    response = await client.get(f"/documents/{document.id}/key-terms")

    assert response.status_code == 409


async def test_key_terms_rejects_a_document_with_no_text(client, db_session, test_user):
    document = await _ready_document(db_session, test_user)

    response = await client.get(f"/documents/{document.id}/key-terms")

    assert response.status_code == 409


async def test_key_terms_rejects_another_users_document(client, db_session):
    other_user = User(email=f"{uuid.uuid4()}@example.com")
    db_session.add(other_user)
    await db_session.flush()
    document = Document(
        user_id=other_user.id,
        filename="lease.pdf",
        doc_type="lease",
        status="ready",
        storage_key="fake/key.pdf",
        file_size_bytes=1024,
    )
    db_session.add(document)
    await db_session.flush()
    await _add_clause(db_session, document, 0, 1, LEASE_RENT_TEXT)
    await db_session.commit()

    response = await client.get(f"/documents/{document.id}/key-terms")

    assert response.status_code == 404


async def test_key_terms_returns_502_when_the_model_gives_nothing_usable(
    client, db_session, test_user, monkeypatch
):
    async def failing(session, document_id, doc_type):
        raise KeyTermsGenerationError("model did not return a valid structured result")

    monkeypatch.setattr(main_module, "get_key_terms", failing)
    document = await _ready_document(db_session, test_user)
    await _add_clause(db_session, document, 0, 1, LEASE_RENT_TEXT)
    await db_session.commit()

    response = await client.get(f"/documents/{document.id}/key-terms")

    assert response.status_code == 502
