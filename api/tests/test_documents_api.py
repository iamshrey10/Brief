import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

import app.main as main_module
from app.auth import get_current_user
from app.checklist import ChecklistEntry, ChecklistGenerationError, ChecklistResponse, Evidence
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


async def test_list_documents_includes_the_ocr_confidence_of_a_scan(client, db_session, test_user):
    db_session.add(
        Document(
            user_id=test_user.id,
            filename="photo.jpg",
            doc_type="lease",
            status="needs_retake",
            storage_key="fake/photo.jpg",
            file_size_bytes=1024,
            ocr_confidence=41.5,
        )
    )
    await db_session.commit()

    (document,) = (await client.get("/documents")).json()

    assert document["ocr_confidence"] == 41.5


async def test_list_documents_says_when_each_was_uploaded_newest_first(client, db_session, test_user):
    from datetime import datetime, timedelta, timezone

    now = datetime.now(timezone.utc)
    for name, age_days in (("old.pdf", 3), ("new.pdf", 0), ("middle.pdf", 1)):
        db_session.add(
            Document(
                user_id=test_user.id,
                filename=name,
                doc_type="lease",
                status="ready",
                storage_key=f"fake/{name}",
                file_size_bytes=1024,
                created_at=now - timedelta(days=age_days),
            )
        )
    await db_session.commit()

    body = (await client.get("/documents")).json()

    assert [d["filename"] for d in body] == ["new.pdf", "middle.pdf", "old.pdf"]
    uploaded = [datetime.fromisoformat(d["created_at"]) for d in body]
    assert uploaded == sorted(uploaded, reverse=True)
    assert abs((uploaded[0] - now).total_seconds()) < 5


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
    assert body["created_at"] is not None


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


# --- GET /documents/{id}/checklist ---

DEPOSIT_TEXT = "The security deposit is $500.00, refundable within 30 days after move-out."


def _fake_checklist_model(monkeypatch, calls: list):
    def fake_generate(questions, clauses):
        calls.append(clauses)
        return ChecklistResponse(
            answers=[
                ChecklistEntry(
                    id="security_deposit",
                    found=True,
                    answer="$500.00, returned within 30 days of move-out.",
                    evidence=[
                        Evidence(
                            clause_ref="C1",
                            quote="The security deposit is $500.00, refundable within 30 days",
                        )
                    ],
                )
            ]
        )

    monkeypatch.setattr("app.checklist.generate_checklist", fake_generate)
    monkeypatch.setattr("app.checklist.judge_answers", lambda items: {q.id for q, _ in items})


async def test_checklist_returns_answers_gaps_and_how_to_ask_and_reuses_them(
    client, db_session, test_user, monkeypatch
):
    document = await _ready_document(db_session, test_user)
    clause = await _add_clause(db_session, document, 0, 2, DEPOSIT_TEXT)
    await db_session.commit()
    calls: list = []
    _fake_checklist_model(monkeypatch, calls)

    first = await client.get(f"/documents/{document.id}/checklist")
    second = await client.get(f"/documents/{document.id}/checklist")

    assert first.status_code == 200
    body = first.json()
    assert body["truncated"] is False
    assert len(body["answers"]) == 10  # the lease checklist
    deposit = next(a for a in body["answers"] if a["id"] == "security_deposit")
    assert deposit["status"] == "answered"
    assert deposit["answer"] == "$500.00, returned within 30 days of move-out."
    assert deposit["evidence"] == [
        {
            "clause_id": str(clause.id),
            "page_number": 2,
            "quote": "The security deposit is $500.00, refundable within 30 days",
        }
    ]
    assert deposit["gap"] is False and deposit["ask_them"] is None
    renewal = next(a for a in body["answers"] if a["id"] == "auto_renewal")
    assert renewal["status"] == "not_mentioned"
    assert renewal["gap"] is True and renewal["ask_them"]
    assert second.json() == body
    assert len(calls) == 1  # the second request used the saved copy


async def test_checklist_rejects_a_document_that_is_not_ready(client, db_session, test_user):
    document = await _ready_document(db_session, test_user)
    # It has text, so only its status can be the reason it is refused.
    await _add_clause(db_session, document, 0, 1, DEPOSIT_TEXT)
    document.status = "processing"
    await db_session.commit()

    response = await client.get(f"/documents/{document.id}/checklist")

    assert response.status_code == 409


async def test_checklist_rejects_a_document_with_no_text(client, db_session, test_user):
    document = await _ready_document(db_session, test_user)

    response = await client.get(f"/documents/{document.id}/checklist")

    assert response.status_code == 409


async def test_checklist_rejects_another_users_document(client, db_session):
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
    await _add_clause(db_session, document, 0, 1, DEPOSIT_TEXT)
    await db_session.commit()

    response = await client.get(f"/documents/{document.id}/checklist")

    assert response.status_code == 404


async def test_checklist_returns_502_when_the_model_gives_nothing_usable(
    client, db_session, test_user, monkeypatch
):
    async def failing(session, document_id, doc_type):
        raise ChecklistGenerationError("model did not return a valid structured result")

    monkeypatch.setattr(main_module, "get_checklist", failing)
    document = await _ready_document(db_session, test_user)
    await _add_clause(db_session, document, 0, 1, DEPOSIT_TEXT)
    await db_session.commit()

    response = await client.get(f"/documents/{document.id}/checklist")

    assert response.status_code == 502


# --- POST /documents/{id}/retry ---


def _record_ingestion(monkeypatch) -> list:
    started: list = []
    monkeypatch.setattr(main_module, "ingest_document", lambda document_id: started.append(document_id))
    return started


async def _document_with(
    db_session,
    test_user,
    status: str,
    age_minutes: int = 0,
    changed_minutes_ago: int | None = None,
    failure_reason: str | None = None,
) -> Document:
    """A document uploaded `age_minutes` ago whose status last changed `changed_minutes_ago`
    minutes ago. Left out, the status is taken to have changed when it was uploaded."""
    from datetime import datetime, timedelta, timezone

    now = datetime.now(timezone.utc)
    document = Document(
        user_id=test_user.id,
        filename="doc.pdf",
        doc_type="lease",
        status=status,
        storage_key="fake/doc.pdf",
        file_size_bytes=1024,
        created_at=now - timedelta(minutes=age_minutes),
        status_changed_at=(
            None if changed_minutes_ago is None else now - timedelta(minutes=changed_minutes_ago)
        ),
        failure_reason=failure_reason,
    )
    db_session.add(document)
    await db_session.commit()
    await db_session.refresh(document)
    return document


async def test_retry_reads_a_failed_document_again(client, db_session, test_user, monkeypatch):
    started = _record_ingestion(monkeypatch)
    document = await _document_with(db_session, test_user, "failed")

    response = await client.post(f"/documents/{document.id}/retry")

    assert response.status_code == 200
    assert response.json()["status"] == "uploaded"
    assert started == [document.id]


async def test_retry_reads_a_document_stuck_for_a_long_time_again(
    client, db_session, test_user, monkeypatch
):
    started = _record_ingestion(monkeypatch)
    document = await _document_with(db_session, test_user, "uploaded", age_minutes=60)

    response = await client.post(f"/documents/{document.id}/retry")

    assert response.status_code == 200
    assert started == [document.id]


async def test_retry_reads_a_long_stuck_processing_document_again(
    client, db_session, test_user, monkeypatch
):
    started = _record_ingestion(monkeypatch)
    document = await _document_with(db_session, test_user, "processing", age_minutes=60)

    response = await client.post(f"/documents/{document.id}/retry")

    assert response.status_code == 200
    assert started == [document.id]


async def test_retry_refuses_a_document_that_is_still_being_read(
    client, db_session, test_user, monkeypatch
):
    started = _record_ingestion(monkeypatch)
    document = await _document_with(db_session, test_user, "processing", age_minutes=2)

    response = await client.post(f"/documents/{document.id}/retry")

    assert response.status_code == 409
    assert started == []


async def test_retry_refuses_a_document_that_is_already_ready(
    client, db_session, test_user, monkeypatch
):
    started = _record_ingestion(monkeypatch)
    document = await _document_with(db_session, test_user, "ready", age_minutes=600)

    response = await client.post(f"/documents/{document.id}/retry")

    assert response.status_code == 409
    assert started == []


async def test_retry_refuses_a_hard_to_read_scan_that_did_read(
    client, db_session, test_user, monkeypatch
):
    started = _record_ingestion(monkeypatch)
    document = await _document_with(db_session, test_user, "needs_retake", age_minutes=600)

    response = await client.post(f"/documents/{document.id}/retry")

    assert response.status_code == 409
    assert started == []


async def test_retry_clears_anything_left_over_so_the_read_starts_clean(
    client, db_session, test_user, monkeypatch
):
    _record_ingestion(monkeypatch)
    document = await _document_with(db_session, test_user, "failed")
    db_session.add(
        Clause(
            document_id=document.id,
            clause_index=0,
            page_number=1,
            char_start=0,
            char_end=5,
            text="stale",
        )
    )
    await db_session.commit()

    await client.post(f"/documents/{document.id}/retry")

    from sqlalchemy import select

    remaining = (await db_session.execute(select(Clause).where(Clause.document_id == document.id))).all()
    assert remaining == []


async def test_retry_rejects_another_users_document(client, db_session, monkeypatch):
    started = _record_ingestion(monkeypatch)
    other_user = User(email=f"{uuid.uuid4()}@example.com")
    db_session.add(other_user)
    await db_session.flush()
    document = Document(
        user_id=other_user.id,
        filename="theirs.pdf",
        doc_type="lease",
        status="failed",
        storage_key="fake/theirs.pdf",
        file_size_bytes=1024,
    )
    db_session.add(document)
    await db_session.commit()
    await db_session.refresh(document)

    response = await client.post(f"/documents/{document.id}/retry")

    assert response.status_code == 404
    assert started == []


async def test_retry_returns_404_for_a_malformed_id(client):
    response = await client.post("/documents/not-a-uuid/retry")

    assert response.status_code == 404


async def test_retry_refuses_a_document_whose_read_only_just_started_however_old_the_upload(
    client, db_session, test_user, monkeypatch
):
    # Uploaded an hour ago, but its status changed two minutes ago: it was just retried.
    started = _record_ingestion(monkeypatch)
    document = await _document_with(
        db_session, test_user, "processing", age_minutes=60, changed_minutes_ago=2
    )

    response = await client.post(f"/documents/{document.id}/retry")

    assert response.status_code == 409
    assert started == []


async def test_a_retry_cannot_be_started_twice_in_a_row(client, db_session, test_user, monkeypatch):
    started = _record_ingestion(monkeypatch)
    document = await _document_with(db_session, test_user, "failed", age_minutes=600)

    first = await client.post(f"/documents/{document.id}/retry")
    second = await client.post(f"/documents/{document.id}/retry")

    assert first.status_code == 200
    assert second.status_code == 409
    assert started == [document.id]  # one read, not two at once


async def test_retry_reads_a_document_whose_status_has_not_changed_for_a_long_time(
    client, db_session, test_user, monkeypatch
):
    started = _record_ingestion(monkeypatch)
    document = await _document_with(
        db_session, test_user, "processing", age_minutes=600, changed_minutes_ago=60
    )

    response = await client.post(f"/documents/{document.id}/retry")

    assert response.status_code == 200
    assert started == [document.id]


async def test_a_retried_document_reports_when_its_status_changed(
    client, db_session, test_user, monkeypatch
):
    from datetime import datetime, timezone

    _record_ingestion(monkeypatch)
    document = await _document_with(db_session, test_user, "failed", age_minutes=600)

    body = (await client.post(f"/documents/{document.id}/retry")).json()

    changed = datetime.fromisoformat(body["status_changed_at"])
    assert abs((changed - datetime.now(timezone.utc)).total_seconds()) < 5


async def test_the_document_list_carries_when_each_status_changed(client, db_session, test_user):
    await _document_with(db_session, test_user, "ready", age_minutes=600, changed_minutes_ago=30)

    (document,) = (await client.get("/documents")).json()

    assert document["status_changed_at"] is not None


# --- DELETE /documents/{id} and PATCH /documents/{id} ---


async def _document_with_everything(db_session, test_user, filename="doc.pdf", key="fake/doc.pdf"):
    """A document with the things a finished read leaves behind: a piece with its embedding, a saved
    key term, and a saved checklist answer."""
    from app.models import ChecklistAnswerRow, Extraction

    document = Document(
        user_id=test_user.id,
        filename=filename,
        doc_type="lease",
        status="ready",
        storage_key=key,
        file_size_bytes=1024,
    )
    db_session.add(document)
    await db_session.flush()
    clause = Clause(
        document_id=document.id, clause_index=0, page_number=1, char_start=0, char_end=9, text="Rent is $5"
    )
    db_session.add(clause)
    await db_session.flush()
    db_session.add(Embedding(clause_id=clause.id, vector=[0.1] * EMBEDDING_DIM))
    db_session.add(
        Extraction(
            document_id=document.id, clause_id=clause.id, field_name="monthly_rent", value="$5", quote="Rent is $5"
        )
    )
    db_session.add(
        ChecklistAnswerRow(
            document_id=document.id,
            question_id="late_fee",
            answer="None",
            evidence=[{"clause_id": str(clause.id), "page_number": 1, "quote": "Rent is $5"}],
        )
    )
    await db_session.commit()
    await db_session.refresh(document)
    return document


async def _counts(db_session, document_id) -> dict:
    from sqlalchemy import func, select

    from app.models import ChecklistAnswerRow, Extraction

    async def count(model, column):
        return await db_session.scalar(select(func.count()).select_from(model).where(column == document_id))

    clauses = await count(Clause, Clause.document_id)
    embeddings = await db_session.scalar(
        select(func.count()).select_from(Embedding).join(Clause).where(Clause.document_id == document_id)
    )
    return {
        "document": await db_session.scalar(
            select(func.count()).select_from(Document).where(Document.id == document_id)
        ),
        "clauses": clauses,
        "embeddings": embeddings,
        "key_terms": await count(Extraction, Extraction.document_id),
        "checklist": await count(ChecklistAnswerRow, ChecklistAnswerRow.document_id),
    }


def _record_file_deletes(monkeypatch) -> list[str]:
    removed: list[str] = []
    monkeypatch.setattr(main_module, "delete_file", lambda key: removed.append(key))
    return removed


async def test_delete_removes_the_document_its_file_and_everything_read_from_it(
    client, db_session, test_user, monkeypatch
):
    removed = _record_file_deletes(monkeypatch)
    document = await _document_with_everything(db_session, test_user, key="fake/mine.pdf")
    document_id = document.id
    assert await _counts(db_session, document_id) == {
        "document": 1, "clauses": 1, "embeddings": 1, "key_terms": 1, "checklist": 1,
    }

    response = await client.delete(f"/documents/{document_id}")

    assert response.status_code == 204
    assert response.content == b""
    assert removed == ["fake/mine.pdf"]
    db_session.expire_all()
    assert await _counts(db_session, document_id) == {
        "document": 0, "clauses": 0, "embeddings": 0, "key_terms": 0, "checklist": 0,
    }


async def test_delete_leaves_every_other_document_untouched(client, db_session, test_user, monkeypatch):
    _record_file_deletes(monkeypatch)
    doomed = await _document_with_everything(db_session, test_user, "doomed.pdf", "fake/doomed.pdf")
    doomed_id = doomed.id  # read now: creating the next document commits, which expires this object
    kept = await _document_with_everything(db_session, test_user, "kept.pdf", "fake/kept.pdf")
    kept_id = kept.id

    await client.delete(f"/documents/{doomed_id}")

    db_session.expire_all()
    assert await _counts(db_session, kept_id) == {
        "document": 1, "clauses": 1, "embeddings": 1, "key_terms": 1, "checklist": 1,
    }
    await db_session.refresh(test_user)  # expire_all above also expired the signed-in user
    listed = [d["filename"] for d in (await client.get("/documents")).json()]
    assert listed == ["kept.pdf"]


async def test_delete_works_for_a_document_that_never_finished_reading(
    client, db_session, test_user, monkeypatch
):
    removed = _record_file_deletes(monkeypatch)
    document = await _document_with(db_session, test_user, "failed")

    response = await client.delete(f"/documents/{document.id}")

    assert response.status_code == 204
    assert removed == ["fake/doc.pdf"]


async def test_delete_keeps_the_document_when_the_file_cannot_be_removed(
    client, db_session, test_user, monkeypatch
):
    def failing(key):
        raise RuntimeError("storage is down")

    monkeypatch.setattr(main_module, "delete_file", failing)
    document = await _document_with_everything(db_session, test_user)
    document_id = document.id

    response = await client.delete(f"/documents/{document_id}")

    assert response.status_code == 502
    assert "nothing was deleted" in response.json()["detail"]
    db_session.expire_all()
    # Everything is still there, so the delete can simply be tried again.
    assert await _counts(db_session, document_id) == {
        "document": 1, "clauses": 1, "embeddings": 1, "key_terms": 1, "checklist": 1,
    }


async def test_delete_can_be_retried_after_a_storage_failure(client, db_session, test_user, monkeypatch):
    attempts = {"count": 0}

    def flaky(key):
        attempts["count"] += 1
        if attempts["count"] == 1:
            raise RuntimeError("storage hiccup")

    monkeypatch.setattr(main_module, "delete_file", flaky)
    document = await _document_with_everything(db_session, test_user)

    first = await client.delete(f"/documents/{document.id}")
    second = await client.delete(f"/documents/{document.id}")

    assert (first.status_code, second.status_code) == (502, 204)


async def test_deleting_the_same_document_twice_is_a_404_the_second_time(
    client, db_session, test_user, monkeypatch
):
    _record_file_deletes(monkeypatch)
    document = await _document_with(db_session, test_user, "ready")

    first = await client.delete(f"/documents/{document.id}")
    second = await client.delete(f"/documents/{document.id}")

    assert (first.status_code, second.status_code) == (204, 404)


async def test_delete_rejects_another_users_document_and_leaves_its_file_alone(
    client, db_session, monkeypatch
):
    removed = _record_file_deletes(monkeypatch)
    other_user = User(email=f"{uuid.uuid4()}@example.com")
    db_session.add(other_user)
    await db_session.flush()
    document = await _document_with_everything(db_session, other_user)
    document_id = document.id

    response = await client.delete(f"/documents/{document_id}")

    assert response.status_code == 404
    assert removed == []
    db_session.expire_all()
    assert (await _counts(db_session, document_id))["document"] == 1


async def test_delete_returns_404_for_a_malformed_id(client, monkeypatch):
    removed = _record_file_deletes(monkeypatch)

    response = await client.delete("/documents/not-a-uuid")

    assert response.status_code == 404
    assert removed == []


# --- PATCH ---


async def test_edit_renames_a_document_and_trims_the_name(client, db_session, test_user):
    document = await _document_with(db_session, test_user, "ready")

    response = await client.patch(f"/documents/{document.id}", json={"filename": "  My Lease 2026.pdf  "})

    assert response.status_code == 200
    assert response.json()["filename"] == "My Lease 2026.pdf"
    listed = (await client.get("/documents")).json()
    assert listed[0]["filename"] == "My Lease 2026.pdf"


async def test_edit_changes_the_kind_of_document(client, db_session, test_user):
    document = await _document_with(db_session, test_user, "ready")

    response = await client.patch(f"/documents/{document.id}", json={"doc_type": "loan"})

    assert response.status_code == 200
    assert response.json()["doc_type"] == "loan"


async def test_changing_the_kind_clears_the_saved_key_terms_and_checklist_so_they_are_redone(
    client, db_session, test_user
):
    document = await _document_with_everything(db_session, test_user)
    other = await _document_with_everything(db_session, test_user, "other.pdf", "fake/other.pdf")
    document_id, other_id = document.id, other.id

    await client.patch(f"/documents/{document_id}", json={"doc_type": "loan"})

    db_session.expire_all()
    mine = await _counts(db_session, document_id)
    assert (mine["key_terms"], mine["checklist"]) == (0, 0)
    # What was read from the file itself is untouched: only what depends on the kind is cleared.
    assert (mine["clauses"], mine["embeddings"]) == (1, 1)
    theirs = await _counts(db_session, other_id)
    assert (theirs["key_terms"], theirs["checklist"]) == (1, 1)


async def test_renaming_keeps_the_saved_key_terms_and_checklist(client, db_session, test_user):
    document = await _document_with_everything(db_session, test_user)
    document_id = document.id

    await client.patch(f"/documents/{document_id}", json={"filename": "Renamed.pdf"})

    db_session.expire_all()
    counts = await _counts(db_session, document_id)
    assert (counts["key_terms"], counts["checklist"]) == (1, 1)


async def test_picking_the_kind_it_already_is_keeps_the_saved_key_terms_and_checklist(
    client, db_session, test_user
):
    document = await _document_with_everything(db_session, test_user)  # it is a lease
    document_id = document.id

    await client.patch(f"/documents/{document_id}", json={"doc_type": "lease"})

    db_session.expire_all()
    counts = await _counts(db_session, document_id)
    assert (counts["key_terms"], counts["checklist"]) == (1, 1)


async def test_edit_changes_nothing_about_the_file_or_its_status(client, db_session, test_user):
    document = await _document_with(db_session, test_user, "ready")

    body = (await client.patch(f"/documents/{document.id}", json={"filename": "x.pdf", "doc_type": "offer"})).json()

    assert body["status"] == "ready"
    await db_session.refresh(document)
    assert document.storage_key == "fake/doc.pdf"
    assert document.file_size_bytes == 1024


async def test_edit_accepts_a_name_of_exactly_200_characters_and_unicode(client, db_session, test_user):
    document = await _document_with(db_session, test_user, "ready")
    name = "é" * 200

    response = await client.patch(f"/documents/{document.id}", json={"filename": name})

    assert response.status_code == 200
    assert response.json()["filename"] == name


@pytest.mark.parametrize(
    "changes",
    [
        {},
        {"filename": None, "doc_type": None},
        {"filename": ""},
        {"filename": "   "},
        {"filename": "x" * 201},
        {"filename": "line one\nline two"},
        {"filename": "bell\x07name"},
        {"doc_type": "mortgage"},
        {"doc_type": ""},
        {"filename": 123},
    ],
)
async def test_edit_refuses_a_change_that_is_not_allowed_and_changes_nothing(
    client, db_session, test_user, changes
):
    document = await _document_with(db_session, test_user, "ready")

    response = await client.patch(f"/documents/{document.id}", json=changes)

    assert response.status_code == 422
    await db_session.refresh(document)
    assert (document.filename, document.doc_type) == ("doc.pdf", "lease")


async def test_edit_rejects_another_users_document(client, db_session):
    other_user = User(email=f"{uuid.uuid4()}@example.com")
    db_session.add(other_user)
    await db_session.flush()
    document = await _document_with_everything(db_session, other_user)
    document_id = document.id

    response = await client.patch(f"/documents/{document_id}", json={"filename": "stolen.pdf"})

    assert response.status_code == 404
    db_session.expire_all()
    assert (await db_session.get(Document, document_id)).filename == "doc.pdf"


async def test_edit_returns_404_for_a_malformed_id(client):
    response = await client.patch("/documents/not-a-uuid", json={"filename": "x"})

    assert response.status_code == 404


# --- the reason a read failed ---


async def test_the_document_list_says_why_a_failed_document_failed(client, db_session, test_user):
    await _document_with(db_session, test_user, "failed", failure_reason="no_text")

    (document,) = (await client.get("/documents")).json()

    assert document["status"] == "failed"
    assert document["failure_reason"] == "no_text"


async def test_a_single_document_says_why_it_failed(client, db_session, test_user):
    document = await _document_with(db_session, test_user, "failed", failure_reason="rate_limit")

    body = (await client.get(f"/documents/{document.id}")).json()

    assert body["failure_reason"] == "rate_limit"


@pytest.mark.parametrize("status", ["ready", "needs_retake", "processing", "uploaded"])
async def test_a_document_that_has_not_failed_has_no_reason(client, db_session, test_user, status):
    await _document_with(db_session, test_user, status)

    (document,) = (await client.get("/documents")).json()

    assert document["failure_reason"] is None


async def test_a_retry_clears_the_reason_so_the_old_failure_is_not_shown_while_it_reads(
    client, db_session, test_user, monkeypatch
):
    _record_ingestion(monkeypatch)
    document = await _document_with(db_session, test_user, "failed", failure_reason="rate_limit")

    body = (await client.post(f"/documents/{document.id}/retry")).json()

    assert body["status"] == "uploaded"
    assert body["failure_reason"] is None
    await db_session.refresh(document)
    assert document.failure_reason is None


async def test_a_retry_of_a_stuck_document_also_leaves_no_reason(
    client, db_session, test_user, monkeypatch
):
    _record_ingestion(monkeypatch)
    document = await _document_with(
        db_session, test_user, "processing", age_minutes=60, changed_minutes_ago=60
    )

    body = (await client.post(f"/documents/{document.id}/retry")).json()

    assert body["failure_reason"] is None


# --- how many documents one person can keep ---


def _upload_body(filename: str = "lease.pdf") -> dict:
    return {
        "filename": filename,
        "doc_type": "lease",
        "content_type": "application/pdf",
        "file_size_bytes": 1024,
    }


async def _fill_to(db_session, test_user, count: int) -> None:
    for number in range(count):
        await _document_with(db_session, test_user, "ready")


async def test_an_upload_is_refused_once_the_person_has_reached_the_document_limit(
    client, db_session, test_user, monkeypatch
):
    monkeypatch.setattr(main_module, "MAX_DOCUMENTS_PER_USER", 3)
    await _fill_to(db_session, test_user, 3)

    response = await client.post("/documents", json=_upload_body())

    assert response.status_code == 409
    assert "3 documents" in response.json()["detail"]
    assert "delete" in response.json()["detail"].lower()
    assert len((await client.get("/documents")).json()) == 3


async def test_an_upload_just_under_the_limit_is_allowed(client, db_session, test_user, monkeypatch):
    monkeypatch.setattr(main_module, "MAX_DOCUMENTS_PER_USER", 3)
    await _fill_to(db_session, test_user, 2)

    response = await client.post("/documents", json=_upload_body())

    assert response.status_code == 200
    assert len((await client.get("/documents")).json()) == 3


async def test_deleting_a_document_makes_room_under_the_limit(
    client, db_session, test_user, monkeypatch
):
    monkeypatch.setattr(main_module, "MAX_DOCUMENTS_PER_USER", 2)
    monkeypatch.setattr(main_module, "delete_file", lambda storage_key: None)
    await _fill_to(db_session, test_user, 2)
    (first, *_rest) = (await client.get("/documents")).json()
    assert (await client.post("/documents", json=_upload_body())).status_code == 409

    assert (await client.delete(f"/documents/{first['id']}")).status_code == 204

    assert (await client.post("/documents", json=_upload_body())).status_code == 200


async def test_another_persons_documents_do_not_count_against_the_limit(
    client, db_session, test_user, monkeypatch
):
    monkeypatch.setattr(main_module, "MAX_DOCUMENTS_PER_USER", 2)
    other = User(email="someone-else@example.com")
    db_session.add(other)
    await db_session.commit()
    for number in range(5):
        db_session.add(
            Document(
                user_id=other.id,
                filename=f"theirs-{number}.pdf",
                doc_type="lease",
                status="ready",
                storage_key=f"other/{number}",
                file_size_bytes=1,
                content_type="application/pdf",
            )
        )
    await db_session.commit()

    assert (await client.post("/documents", json=_upload_body())).status_code == 200


async def test_a_refused_upload_creates_no_record_and_no_upload_link(
    client, db_session, test_user, monkeypatch
):
    monkeypatch.setattr(main_module, "MAX_DOCUMENTS_PER_USER", 1)
    await _fill_to(db_session, test_user, 1)
    links = []
    monkeypatch.setattr(
        main_module, "create_presigned_upload_url", lambda *args: links.append(args) or "url"
    )

    await client.post("/documents", json=_upload_body())

    assert links == []


def test_the_default_limit_is_a_sensible_number():
    assert 10 <= main_module.MAX_DOCUMENTS_PER_USER <= 100
