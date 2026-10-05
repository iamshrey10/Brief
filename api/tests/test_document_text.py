from app import document_text
from app.document_text import load_prompt_clauses
from app.models import Clause, Document


async def _document(db_session, test_user, texts: list[str]) -> Document:
    document = Document(
        user_id=test_user.id,
        filename="doc.pdf",
        doc_type="loan",
        status="ready",
        storage_key="fake/key.pdf",
        file_size_bytes=1024,
    )
    db_session.add(document)
    await db_session.flush()
    # Inserted out of order on purpose, so the test proves the loader sorts by clause_index.
    for index in reversed(range(len(texts))):
        db_session.add(
            Clause(
                document_id=document.id,
                clause_index=index,
                page_number=1,
                char_start=0,
                char_end=len(texts[index]),
                text=texts[index],
            )
        )
    await db_session.commit()
    return document


async def test_clauses_come_back_in_document_order_with_c_labels(db_session, test_user):
    document = await _document(db_session, test_user, ["first", "second", "third"])

    loaded = await load_prompt_clauses(db_session, document.id)

    assert loaded.labeled == [("C1", "first"), ("C2", "second"), ("C3", "third")]
    assert loaded.truncated is False


async def test_each_label_maps_back_to_its_clause(db_session, test_user):
    document = await _document(db_session, test_user, ["first", "second"])

    loaded = await load_prompt_clauses(db_session, document.id)

    assert loaded.by_label["C2"].text == "second"
    assert [c.text for c in loaded.sent] == ["first", "second"]


async def test_a_document_over_the_limit_is_cut_and_flagged(db_session, test_user, monkeypatch):
    monkeypatch.setattr(document_text, "MAX_PROMPT_CHARS", len("first") + 3)
    document = await _document(db_session, test_user, ["first", "second", "third"])

    loaded = await load_prompt_clauses(db_session, document.id)

    assert [label for label, _ in loaded.labeled] == ["C1"]
    assert loaded.truncated is True


async def test_a_document_exactly_at_the_limit_is_not_flagged(db_session, test_user, monkeypatch):
    monkeypatch.setattr(document_text, "MAX_PROMPT_CHARS", len("first") + len("second"))
    document = await _document(db_session, test_user, ["first", "second"])

    loaded = await load_prompt_clauses(db_session, document.id)

    assert len(loaded.sent) == 2
    assert loaded.truncated is False


async def test_a_document_with_no_clauses_is_empty_and_not_flagged(db_session, test_user):
    document = await _document(db_session, test_user, [])

    loaded = await load_prompt_clauses(db_session, document.id)

    assert loaded.sent == [] and loaded.labeled == [] and loaded.truncated is False
