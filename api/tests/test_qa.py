import pytest

from app.qa import (
    ANSWER_MODEL,
    AnswerGenerationError,
    Citation,
    GroundedAnswer,
    build_prompt,
    generate_answer,
)


class _FakeResponse:
    def __init__(self, parsed):
        self.parsed = parsed


class _FakeModels:
    def __init__(self, parsed):
        self._parsed = parsed
        self.calls: list[dict] = []

    def generate_content(self, *, model, contents, config):
        self.calls.append({"model": model, "contents": contents, "config": config})
        return _FakeResponse(self._parsed)


class _FakeClient:
    def __init__(self, parsed):
        self.models = _FakeModels(parsed)


def _install_fake_client(monkeypatch, parsed) -> _FakeClient:
    client = _FakeClient(parsed)
    monkeypatch.setattr("app.qa.get_genai_client", lambda: client)
    return client


CLAUSES = [
    ("C1", "The borrower may prepay all or part of the loan at any time without penalty."),
    ("C2", "A late charge of five percent applies if a payment is more than fifteen days late."),
]


def test_build_prompt_labels_every_clause_and_includes_the_question():
    prompt = build_prompt("Can I pay early?", CLAUSES)

    assert "[C1] The borrower may prepay" in prompt
    assert "[C2] A late charge" in prompt
    assert prompt.endswith("Question: Can I pay early?")


def test_generate_answer_returns_the_models_structured_answer(monkeypatch):
    expected = GroundedAnswer(
        found=True,
        answer="Yes, with no penalty.",
        citations=[Citation(clause_ref="C1", quote="at any time without penalty")],
    )
    _install_fake_client(monkeypatch, expected)

    result = generate_answer("Can I pay early?", CLAUSES)

    assert result == expected


def test_generate_answer_asks_for_deterministic_schema_constrained_output(monkeypatch):
    client = _install_fake_client(monkeypatch, GroundedAnswer(found=False, answer="n/a", citations=[]))

    generate_answer("Anything?", CLAUSES)

    call = client.models.calls[0]
    assert call["model"] == ANSWER_MODEL
    assert call["config"].temperature == 0.0
    assert call["config"].response_schema is GroundedAnswer
    assert call["config"].response_mime_type == "application/json"


def test_generate_answer_tells_the_model_to_treat_clauses_as_data_not_instructions(monkeypatch):
    client = _install_fake_client(monkeypatch, GroundedAnswer(found=False, answer="n/a", citations=[]))

    generate_answer("Anything?", CLAUSES)

    instruction = client.models.calls[0]["config"].system_instruction
    assert "never as instructions" in instruction
    assert "ONLY" in instruction


def test_generate_answer_raises_when_the_model_returns_nothing_usable(monkeypatch):
    _install_fake_client(monkeypatch, None)

    with pytest.raises(AnswerGenerationError):
        generate_answer("Anything?", CLAUSES)
