import asyncio
import io
import math
import time
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pymupdf
import pytest
from botocore.exceptions import ClientError as BotoClientError
from google.genai import errors as genai_errors
from PIL import Image, ImageDraw, ImageFont
from sqlalchemy import select

from app import ingestion as ingestion_module
from app.ingestion import (
    DEFAULT_RETRY_WAIT_SECONDS,
    FAILURE_REASONS,
    MAX_RATE_LIMIT_RETRIES,
    MAX_RETRY_WAIT_SECONDS,
    TooLongError,
    UnreadableFileError,
    _normalize,
    classify_failure,
    embed_texts,
    extract_pages,
    ingest_document,
)
from app.models import EMBEDDING_DIM, Clause, Document, Embedding, User


def _make_pdf_bytes(page_texts: list[str]) -> bytes:
    doc = pymupdf.open()
    for text in page_texts:
        page = doc.new_page()
        page.insert_text((72, 72), text)
    return doc.tobytes()


def _make_image_bytes(text: str) -> bytes:
    image = Image.new("RGB", (900, 250), color="white")
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default(size=48)
    draw.text((30, 90), text, fill="black", font=font)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _make_document(user: User, **overrides) -> Document:
    defaults = dict(
        user_id=user.id,
        filename="sample.pdf",
        doc_type="lease",
        status="uploaded",
        storage_key="fake/key.pdf",
        file_size_bytes=1024,
    )
    defaults.update(overrides)
    return Document(**defaults)


# --- _normalize: pure logic, no database needed ---


def test_normalize_produces_a_unit_vector():
    normalized = _normalize([3.0, 4.0])
    magnitude = math.sqrt(sum(component * component for component in normalized))
    assert math.isclose(magnitude, 1.0, rel_tol=1e-9)


def test_normalize_handles_zero_vector_without_dividing_by_zero():
    assert _normalize([0.0, 0.0]) == [0.0, 0.0]


# --- ingest_document: real Postgres, real PyMuPDF, mocked network calls ---


async def test_ingest_document_creates_matching_clauses_and_embeddings(
    db_session, test_user, monkeypatch
):
    document = _make_document(test_user)
    db_session.add(document)
    await db_session.commit()
    await db_session.refresh(document)

    pdf_bytes = _make_pdf_bytes(["Page one clause text.", "Page two clause text."])

    monkeypatch.setattr("app.ingestion.download_file", lambda storage_key: pdf_bytes)
    monkeypatch.setattr(
        "app.ingestion.embed_texts",
        lambda texts: [[0.1] * EMBEDDING_DIM for _ in texts],
    )

    await ingest_document(document.id)

    await db_session.refresh(document)
    assert document.status == "ready"

    clauses = (
        await db_session.execute(select(Clause).where(Clause.document_id == document.id))
    ).scalars().all()
    assert len(clauses) == 2
    assert {c.page_number for c in clauses} == {1, 2}

    embeddings = (
        await db_session.execute(
            select(Embedding).where(Embedding.clause_id.in_([c.id for c in clauses]))
        )
    ).scalars().all()
    assert len(embeddings) == 2
    assert all(len(e.vector) == EMBEDDING_DIM for e in embeddings)


async def test_ingest_document_segments_numbered_text_into_real_clauses(
    db_session, test_user, monkeypatch
):
    document = _make_document(test_user)
    db_session.add(document)
    await db_session.commit()
    await db_session.refresh(document)

    numbered_text = (
        "1. The Borrower shall repay the loan in full.\n"
        "2. Interest accrues at six percent annually.\n"
        "3. Late payments incur a twenty five dollar fee."
    )
    pdf_bytes = _make_pdf_bytes([numbered_text])

    monkeypatch.setattr("app.ingestion.download_file", lambda storage_key: pdf_bytes)
    monkeypatch.setattr(
        "app.ingestion.embed_texts",
        lambda texts: [[0.1] * EMBEDDING_DIM for _ in texts],
    )

    await ingest_document(document.id)

    await db_session.refresh(document)
    assert document.status == "ready"

    clauses = (
        await db_session.execute(
            select(Clause).where(Clause.document_id == document.id).order_by(Clause.clause_index)
        )
    ).scalars().all()

    # three real numbered clauses, not one naive blob, this is the whole point of
    # structure-aware segmentation over the old fixed-size chunker
    assert len(clauses) == 3
    assert clauses[0].text.startswith("1.")
    assert clauses[1].text.startswith("2.")
    assert clauses[2].text.startswith("3.")


async def test_ingest_document_marks_failed_when_embedding_call_errors(
    db_session, test_user, monkeypatch
):
    document = _make_document(test_user)
    db_session.add(document)
    await db_session.commit()
    await db_session.refresh(document)

    pdf_bytes = _make_pdf_bytes(["Some real page text."])

    def _raise(texts: list[str]):
        raise RuntimeError("embedding api unavailable")

    monkeypatch.setattr("app.ingestion.download_file", lambda storage_key: pdf_bytes)
    monkeypatch.setattr("app.ingestion.embed_texts", _raise)

    await ingest_document(document.id)

    await db_session.refresh(document)
    assert document.status == "failed"

    clauses = (
        await db_session.execute(select(Clause).where(Clause.document_id == document.id))
    ).scalars().all()
    assert clauses == []


async def test_ingest_document_marks_failed_when_pdf_has_no_extractable_text(
    db_session, test_user, monkeypatch
):
    document = _make_document(test_user)
    db_session.add(document)
    await db_session.commit()
    await db_session.refresh(document)

    blank_pdf = pymupdf.open()
    blank_pdf.new_page()

    monkeypatch.setattr("app.ingestion.download_file", lambda storage_key: blank_pdf.tobytes())

    await ingest_document(document.id)

    await db_session.refresh(document)
    assert document.status == "failed"


async def test_ingest_document_does_nothing_for_missing_document_id():
    # should log and return quietly, not raise, since the document row simply doesn't exist
    await ingest_document(uuid.uuid4())


# --- ingest_document: real image path, OCR runs for real, embeddings mocked ---


async def test_ingest_document_processes_a_real_photographed_page_via_ocr(
    db_session, test_user, monkeypatch
):
    document = _make_document(
        test_user, filename="photo.png", content_type="image/png", storage_key="fake/photo.png"
    )
    db_session.add(document)
    await db_session.commit()
    await db_session.refresh(document)

    image_bytes = _make_image_bytes("Late fee is two hundred dollars")

    monkeypatch.setattr("app.ingestion.download_file", lambda storage_key: image_bytes)
    monkeypatch.setattr(
        "app.ingestion.embed_texts",
        lambda texts: [[0.1] * EMBEDDING_DIM for _ in texts],
    )

    await ingest_document(document.id)

    await db_session.refresh(document)
    assert document.status == "ready"
    assert document.ocr_confidence is not None
    assert document.ocr_confidence > 0

    clauses = (
        await db_session.execute(select(Clause).where(Clause.document_id == document.id))
    ).scalars().all()
    assert len(clauses) == 1
    assert "fee" in clauses[0].text.lower() or "dollars" in clauses[0].text.lower()


async def test_ingest_document_marks_needs_retake_for_low_confidence_ocr(
    db_session, test_user, monkeypatch
):
    document = _make_document(
        test_user, filename="blurry.png", content_type="image/png", storage_key="fake/blurry.png"
    )
    db_session.add(document)
    await db_session.commit()
    await db_session.refresh(document)

    monkeypatch.setattr("app.ingestion.download_file", lambda storage_key: b"fake-bytes")
    monkeypatch.setattr(
        "app.ingestion.ocr_image", lambda image_bytes: ("some garbled text", 25.0)
    )
    monkeypatch.setattr(
        "app.ingestion.embed_texts",
        lambda texts: [[0.1] * EMBEDDING_DIM for _ in texts],
    )

    await ingest_document(document.id)

    await db_session.refresh(document)
    assert document.status == "needs_retake"
    assert document.ocr_confidence == 25.0


# --- embed_texts: waiting out Gemini's rate limit instead of failing the whole document ---

def _api_error(code: int, message: str) -> genai_errors.APIError:
    status = "RESOURCE_EXHAUSTED" if code == 429 else "INTERNAL"
    return genai_errors.ClientError(code, {"error": {"message": message, "status": status}}, None)


def _rate_limited(retry_in: str = "7.89s") -> genai_errors.APIError:
    return _api_error(429, f"You exceeded your current quota. Please retry in {retry_in}.")


class _ScriptedEmbeddings:
    """A fake embedding client that plays back a script: an exception to raise, or 'ok'."""

    def __init__(self, script):
        self.script = list(script)
        self.requests: list[int] = []  # how many texts each request carried
        self.models = self

    def embed_content(self, *, model, contents, config):
        self.requests.append(len(contents))
        outcome = self.script.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return SimpleNamespace(embeddings=[SimpleNamespace(values=[3.0, 4.0]) for _ in contents])


def _install(monkeypatch, script):
    client = _ScriptedEmbeddings(script)
    waits: list[float] = []
    monkeypatch.setattr("app.ingestion.get_genai_client", lambda: client)
    monkeypatch.setattr("app.ingestion._sleep", waits.append)
    return client, waits


def test_embed_texts_waits_as_long_as_gemini_says_and_then_succeeds(monkeypatch):
    client, waits = _install(monkeypatch, [_rate_limited("7.89s"), "ok"])

    vectors = embed_texts(["one", "two"])

    assert len(vectors) == 2
    assert waits == [7.89 + 1.0]
    assert client.requests == [2, 2]  # the same batch, sent again


def test_embed_texts_repeats_only_the_batch_that_was_refused(monkeypatch):
    # 250 texts is three batches of 100, 100, and 50. The second is refused once.
    client, waits = _install(monkeypatch, ["ok", _rate_limited(), "ok", "ok"])

    vectors = embed_texts([f"text {i}" for i in range(250)])

    assert len(vectors) == 250
    assert client.requests == [100, 100, 100, 50]
    assert len(waits) == 1


def test_embed_texts_keeps_every_vector_in_order_across_retries(monkeypatch):
    client, _ = _install(monkeypatch, ["ok", _rate_limited(), "ok"])

    vectors = embed_texts([f"text {i}" for i in range(150)])

    assert len(vectors) == 150
    assert all(abs(sum(c * c for c in v) ** 0.5 - 1.0) < 1e-9 for v in vectors)  # still normalized


def test_embed_texts_gives_up_after_the_retry_limit(monkeypatch):
    errors = [_rate_limited() for _ in range(MAX_RATE_LIMIT_RETRIES + 1)]
    client, waits = _install(monkeypatch, errors)

    with pytest.raises(genai_errors.APIError):
        embed_texts(["one"])

    assert len(client.requests) == MAX_RATE_LIMIT_RETRIES + 1
    assert len(waits) == MAX_RATE_LIMIT_RETRIES


def test_embed_texts_does_not_wait_for_a_daily_quota_that_will_not_reset(monkeypatch):
    daily = _api_error(
        429, "Quota exceeded for metric: embed_content_free_tier_requests, quotaId: EmbedContentRequestsPerDay"
    )
    client, waits = _install(monkeypatch, [daily])

    with pytest.raises(genai_errors.APIError):
        embed_texts(["one"])

    assert waits == []
    assert len(client.requests) == 1


@pytest.mark.parametrize("code", [400, 403, 404, 500, 503])
def test_embed_texts_does_not_retry_errors_that_are_not_a_rate_limit(monkeypatch, code):
    client, waits = _install(monkeypatch, [_api_error(code, "something else is wrong")])

    with pytest.raises(genai_errors.APIError):
        embed_texts(["one"])

    assert waits == []
    assert len(client.requests) == 1


def test_embed_texts_caps_how_long_it_will_wait_for_one_retry(monkeypatch):
    _, waits = _install(monkeypatch, [_rate_limited("500s"), "ok"])

    embed_texts(["one"])

    assert waits == [MAX_RETRY_WAIT_SECONDS]


def test_embed_texts_uses_a_default_wait_when_gemini_gives_no_hint(monkeypatch):
    _, waits = _install(monkeypatch, [_api_error(429, "Too many requests, slow down."), "ok"])

    embed_texts(["one"])

    assert waits == [DEFAULT_RETRY_WAIT_SECONDS]


async def test_ingestion_does_not_freeze_the_server_while_waiting_on_the_rate_limit(
    db_session, test_user, monkeypatch
):
    pdf_bytes = _make_pdf_bytes(["Interest accrues at six percent per year."])
    document = _make_document(test_user, filename="slow.pdf")
    db_session.add(document)
    await db_session.commit()

    def slow_embed(texts):
        time.sleep(0.3)  # stands in for waiting out a rate limit
        return [[1.0] + [0.0] * (EMBEDDING_DIM - 1) for _ in texts]

    monkeypatch.setattr("app.ingestion.download_file", lambda storage_key: pdf_bytes)
    monkeypatch.setattr("app.ingestion.embed_texts", slow_embed)

    ticks = 0

    async def heartbeat():
        nonlocal ticks
        while True:
            await asyncio.sleep(0.01)
            ticks += 1

    beat = asyncio.create_task(heartbeat())
    await ingest_document(document.id)
    beat.cancel()

    # If embedding blocked the event loop, the heartbeat could not have run during the 0.3s.
    assert ticks >= 10


# --- every status change records when it happened ---

def _is_just_now(moment: datetime | None) -> bool:
    return moment is not None and abs((datetime.now(timezone.utc) - moment).total_seconds()) < 10


async def _document_long_ago(db_session, test_user) -> Document:
    """A document uploaded and last changed an hour ago, so a fresh change is easy to spot."""
    long_ago = datetime.now(timezone.utc) - timedelta(hours=1)
    document = _make_document(test_user, created_at=long_ago, status_changed_at=long_ago)
    db_session.add(document)
    await db_session.commit()
    await db_session.refresh(document)
    return document


def _record_stamps(monkeypatch) -> list[tuple[str, bool]]:
    """Records each status change as it is stamped: the status, and whether the time was just set."""
    stamped: list[tuple[str, bool]] = []
    real_set_status = ingestion_module._set_status

    def spying_set_status(doc, status, failure_reason=None):
        real_set_status(doc, status, failure_reason)
        stamped.append((status, _is_just_now(doc.status_changed_at)))

    monkeypatch.setattr("app.ingestion._set_status", spying_set_status)
    return stamped


async def test_a_document_that_reads_successfully_records_when_it_became_ready(
    db_session, test_user, monkeypatch
):
    document = await _document_long_ago(db_session, test_user)
    pdf_bytes = _make_pdf_bytes(["Some real page text."])
    monkeypatch.setattr("app.ingestion.download_file", lambda storage_key: pdf_bytes)
    monkeypatch.setattr("app.ingestion.embed_texts", lambda texts: [[0.1] * EMBEDDING_DIM for _ in texts])
    stamped = _record_stamps(monkeypatch)

    await ingest_document(document.id)

    await db_session.refresh(document)
    assert document.status == "ready"
    assert _is_just_now(document.status_changed_at)
    assert stamped[-1] == ("ready", True)


async def test_a_document_that_fails_records_when_it_failed(db_session, test_user, monkeypatch):
    document = await _document_long_ago(db_session, test_user)
    pdf_bytes = _make_pdf_bytes(["Some real page text."])

    def _raise(texts):
        raise RuntimeError("embedding api unavailable")

    monkeypatch.setattr("app.ingestion.download_file", lambda storage_key: pdf_bytes)
    monkeypatch.setattr("app.ingestion.embed_texts", _raise)
    stamped = _record_stamps(monkeypatch)

    await ingest_document(document.id)

    await db_session.refresh(document)
    assert document.status == "failed"
    assert _is_just_now(document.status_changed_at)
    assert stamped == [("processing", True), ("failed", True)]


async def test_a_document_with_no_text_records_when_it_failed(db_session, test_user, monkeypatch):
    document = await _document_long_ago(db_session, test_user)
    blank_pdf = pymupdf.open()
    blank_pdf.new_page()
    monkeypatch.setattr("app.ingestion.download_file", lambda storage_key: blank_pdf.tobytes())
    stamped = _record_stamps(monkeypatch)

    await ingest_document(document.id)

    await db_session.refresh(document)
    assert document.status == "failed"
    assert _is_just_now(document.status_changed_at)
    assert stamped == [("processing", True), ("failed", True)]


async def test_a_document_is_stamped_when_it_starts_being_read_not_only_when_it_finishes(
    db_session, test_user, monkeypatch
):
    document = await _document_long_ago(db_session, test_user)
    pdf_bytes = _make_pdf_bytes(["Some real page text."])
    monkeypatch.setattr("app.ingestion.download_file", lambda storage_key: pdf_bytes)
    monkeypatch.setattr("app.ingestion.embed_texts", lambda texts: [[0.1] * EMBEDDING_DIM for _ in texts])
    stamped = _record_stamps(monkeypatch)

    await ingest_document(document.id)

    # A read that waits minutes on the rate limit is "processing" for all that time, and the moment
    # it started is what a stalled read is measured from.
    assert stamped == [("processing", True), ("ready", True)]


# --- why a read failed: each way is told apart, so the page can say what to do ---


def test_every_failure_reason_the_code_can_produce_is_a_known_one():
    produced = {
        classify_failure(UnreadableFileError("x")),
        classify_failure(TooLongError("x")),
        classify_failure(BotoClientError({"Error": {"Code": "500"}}, "GetObject")),
        classify_failure(_rate_limited()),
        classify_failure(_api_error(429, "Quota exceeded, quotaId: EmbedContentRequestsPerDay")),
        classify_failure(_api_error(503, "overloaded")),
        classify_failure(RuntimeError("anything else")),
    }
    assert produced <= set(FAILURE_REASONS)
    assert len(produced) == 7  # and each of these ways has its own reason


@pytest.mark.parametrize(
    ("error", "reason"),
    [
        (UnreadableFileError("damaged"), "unreadable_file"),
        (TooLongError("a hundred and one pages"), "too_long"),
        (BotoClientError({"Error": {"Code": "NoSuchKey"}}, "GetObject"), "storage"),
        (_rate_limited(), "rate_limit"),
        (_api_error(429, "Please retry in 3s"), "rate_limit"),
        (_api_error(429, "quotaId: GenerateRequestsPerDayPerProjectPerModel"), "daily_limit"),
        (_api_error(500, "internal"), "service_error"),
        (_api_error(400, "bad request"), "service_error"),
        (RuntimeError("something nobody planned for"), "unknown"),
        (ValueError("also unplanned"), "unknown"),
    ],
)
def test_classify_failure_names_the_reason(error, reason):
    assert classify_failure(error) == reason


def test_a_damaged_pdf_is_reported_as_unreadable_not_as_a_crash():
    with pytest.raises(UnreadableFileError):
        extract_pages(b"this is not a pdf at all " * 20, "application/pdf")


def test_an_empty_file_is_reported_as_unreadable():
    with pytest.raises(UnreadableFileError):
        extract_pages(b"", "application/pdf")


def test_a_password_protected_pdf_is_reported_as_unreadable():
    document = pymupdf.open()
    document.new_page().insert_text((72, 72), "secret text")
    locked = document.tobytes(encryption=pymupdf.PDF_ENCRYPT_AES_256, user_pw="pw", owner_pw="pw")

    with pytest.raises(UnreadableFileError, match="password"):
        extract_pages(locked, "application/pdf")


def test_bytes_that_are_not_an_image_are_reported_as_unreadable():
    with pytest.raises(UnreadableFileError):
        extract_pages(b"definitely not an image", "image/png")


async def _failed_read(db_session, test_user, monkeypatch, *, download=None, embed=None, pdf=None):
    document = _make_document(test_user, failure_reason=None)
    db_session.add(document)
    await db_session.commit()
    await db_session.refresh(document)

    pdf_bytes = pdf if pdf is not None else _make_pdf_bytes(["Some real page text."])
    monkeypatch.setattr("app.ingestion.download_file", download or (lambda key: pdf_bytes))
    monkeypatch.setattr(
        "app.ingestion.embed_texts",
        embed or (lambda texts: [[0.1] * EMBEDDING_DIM for _ in texts]),
    )

    await ingest_document(document.id)
    await db_session.refresh(document)
    return document


async def test_a_pdf_with_no_text_fails_with_the_reason_no_text(db_session, test_user, monkeypatch):
    blank = pymupdf.open()
    blank.new_page()

    document = await _failed_read(db_session, test_user, monkeypatch, pdf=blank.tobytes())

    assert (document.status, document.failure_reason) == ("failed", "no_text")


async def test_a_damaged_pdf_fails_with_the_reason_unreadable_file(db_session, test_user, monkeypatch):
    document = await _failed_read(db_session, test_user, monkeypatch, pdf=b"garbage " * 50)

    assert (document.status, document.failure_reason) == ("failed", "unreadable_file")


async def test_a_file_that_cannot_be_fetched_fails_with_the_reason_storage(
    db_session, test_user, monkeypatch
):
    def failing_download(key):
        raise BotoClientError({"Error": {"Code": "InternalError"}}, "GetObject")

    document = await _failed_read(db_session, test_user, monkeypatch, download=failing_download)

    assert (document.status, document.failure_reason) == ("failed", "storage")


async def test_a_rate_limit_that_never_clears_fails_with_the_reason_rate_limit(
    db_session, test_user, monkeypatch
):
    def always_limited(texts):
        raise _rate_limited()

    document = await _failed_read(db_session, test_user, monkeypatch, embed=always_limited)

    assert (document.status, document.failure_reason) == ("failed", "rate_limit")


async def test_a_daily_quota_fails_with_the_reason_daily_limit(db_session, test_user, monkeypatch):
    def daily(texts):
        raise _api_error(429, "quotaId: EmbedContentRequestsPerDay")

    document = await _failed_read(db_session, test_user, monkeypatch, embed=daily)

    assert (document.status, document.failure_reason) == ("failed", "daily_limit")


async def test_an_unexpected_error_fails_with_the_reason_unknown(db_session, test_user, monkeypatch):
    def broken(texts):
        raise RuntimeError("something nobody planned for")

    document = await _failed_read(db_session, test_user, monkeypatch, embed=broken)

    assert (document.status, document.failure_reason) == ("failed", "unknown")


async def test_a_successful_read_clears_a_reason_left_from_an_earlier_failure(
    db_session, test_user, monkeypatch
):
    document = _make_document(test_user, status="uploaded", failure_reason="rate_limit")
    db_session.add(document)
    await db_session.commit()
    await db_session.refresh(document)
    pdf_bytes = _make_pdf_bytes(["Some real page text."])
    monkeypatch.setattr("app.ingestion.download_file", lambda key: pdf_bytes)
    monkeypatch.setattr("app.ingestion.embed_texts", lambda texts: [[0.1] * EMBEDDING_DIM for _ in texts])

    await ingest_document(document.id)

    await db_session.refresh(document)
    assert (document.status, document.failure_reason) == ("ready", None)


async def test_a_reason_is_only_ever_kept_while_the_document_is_failed(db_session, test_user):
    from app.ingestion import _set_status

    document = _make_document(test_user)

    _set_status(document, "failed", "no_text")
    assert document.failure_reason == "no_text"

    _set_status(document, "processing", "no_text")  # a reason passed with another status is dropped
    assert document.failure_reason is None


# --- a cap on how long one document can be, so a huge file cannot run up the reading bill ---


def test_a_pdf_with_more_pages_than_the_limit_is_refused(monkeypatch):
    monkeypatch.setattr(ingestion_module, "MAX_PAGES", 3)

    with pytest.raises(TooLongError, match="3"):
        extract_pages(_make_pdf_bytes(["a", "b", "c", "d"]), "application/pdf")


def test_a_pdf_with_exactly_the_limit_is_read(monkeypatch):
    monkeypatch.setattr(ingestion_module, "MAX_PAGES", 3)

    pages, _ = extract_pages(_make_pdf_bytes(["a", "b", "c"]), "application/pdf")

    assert len(pages) == 3


def test_a_too_long_pdf_is_refused_before_any_page_is_read(monkeypatch):
    monkeypatch.setattr(ingestion_module, "MAX_PAGES", 2)
    read = []
    monkeypatch.setattr(ingestion_module, "page_text", lambda page: read.append(page) or "x")

    with pytest.raises(TooLongError):
        extract_pages(_make_pdf_bytes(["a", "b", "c"]), "application/pdf")

    assert read == []


def test_the_page_limit_is_big_enough_for_a_real_lease_and_not_unlimited():
    assert 60 <= ingestion_module.MAX_PAGES <= 300


async def test_a_too_long_document_fails_with_the_reason_too_long(db_session, test_user, monkeypatch):
    monkeypatch.setattr(ingestion_module, "MAX_PAGES", 2)
    embedded = []
    document = await _failed_read(
        db_session,
        test_user,
        monkeypatch,
        pdf=_make_pdf_bytes(["a page", "another page", "a third page"]),
        embed=lambda texts: embedded.append(texts) or [[0.1] * EMBEDDING_DIM for _ in texts],
    )

    assert (document.status, document.failure_reason) == ("failed", "too_long")
    assert embedded == []  # nothing was sent to the paid service
