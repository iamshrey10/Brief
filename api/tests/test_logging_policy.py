"""Brief holds private documents, so what is logged is limited to ids. These tests fail if a log line
is added that could carry the text of a document, a question, an answer, or a person's file name."""

import ast
from pathlib import Path

import pytest

APP = Path(__file__).resolve().parent.parent / "app"
LOG_METHODS = {"debug", "info", "warning", "error", "exception", "critical", "log"}
# The only values a log line may carry besides its fixed message.
ALLOWED_ARGUMENTS = {
    "document_id",
    "document.id",
    "user_id",
    "user.id",
    # The numbers in the message about waiting out a rate limit.
    "wait",
    "attempt + 1",
    "MAX_RATE_LIMIT_RETRIES",
}


def log_calls():
    for path in sorted(APP.glob("*.py")):
        tree = ast.parse(path.read_text())
        for node in ast.walk(tree):
            if (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Attribute)
                and node.func.attr in LOG_METHODS
                and isinstance(node.func.value, ast.Name)
                and node.func.value.id in {"logger", "logging"}
            ):
                yield path.name, node


def test_the_policy_finds_the_log_lines_it_is_meant_to_check():
    found = list(log_calls())

    assert len(found) >= 8  # if this drops to nothing the check below would pass for the wrong reason


@pytest.mark.parametrize("filename, call", list(log_calls()), ids=lambda v: v if isinstance(v, str) else f"line {v.lineno}")
def test_a_log_line_carries_only_a_fixed_message_and_ids(filename, call):
    message, *arguments = call.args
    assert isinstance(message, ast.Constant) and isinstance(message.value, str), (
        f"{filename}:{call.lineno} builds its message from values, use a fixed message with %s and ids"
    )
    assert not call.keywords or all(k.arg in {"exc_info"} for k in call.keywords)
    for argument in arguments:
        assert ast.unparse(argument) in ALLOWED_ARGUMENTS, (
            f"{filename}:{call.lineno} logs {ast.unparse(argument)!r}, only ids are allowed"
        )


def test_the_policy_would_catch_a_line_that_logs_text():
    bad = ast.parse('logger.error("failed on %s", clause.text)').body[0].value  # type: ignore[attr-defined]
    message, *arguments = bad.args

    assert ast.unparse(arguments[0]) not in ALLOWED_ARGUMENTS
