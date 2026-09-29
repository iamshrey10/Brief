import uuid

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

import app.main as main_module
from app.auth import get_current_user
from app.main import app
from app.models import Document, User


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
