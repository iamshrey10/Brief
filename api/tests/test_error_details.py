"""Every error the API raises says what is wrong in plain words and never repeats the text of an exception, which can
hold a file path, a database address or part of a document."""

import ast
from pathlib import Path

import pytest

APP = Path(__file__).resolve().parent.parent / "app"
FILES = sorted(path for path in APP.glob("*.py"))
EXCEPTION_NAMES = {"exc", "error", "err", "e", "exception"}

# The two places an error's detail is not a written sentence in place, each checked by a test below:
#  - `detail=str(error)` for a ValueError raised by our own clean_filename, whose messages are fixed text
#  - `detail=problem`, a variable that only ever holds fixed strings
PASSES_ON_OUR_OWN_MESSAGE = {("main.py", "str(error)")}
HOLDS_FIXED_STRINGS = {("main.py", "problem")}


def _http_exceptions(path: Path) -> list[ast.Call]:
    return [
        node
        for node in ast.walk(ast.parse(path.read_text()))
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "HTTPException"
    ]


def _names_used(node: ast.AST) -> set[str]:
    return {inner.id for inner in ast.walk(node) if isinstance(inner, ast.Name)}


def _detail(call: ast.Call) -> ast.AST | None:
    return next((keyword.value for keyword in call.keywords if keyword.arg == "detail"), None)


def test_it_finds_the_errors_it_is_meant_to_check():
    assert sum(len(_http_exceptions(path)) for path in FILES) >= 25


@pytest.mark.parametrize("path", FILES, ids=[p.name for p in FILES])
def test_every_error_has_a_status_and_a_written_detail(path):
    for call in _http_exceptions(path):
        status = next((k.value for k in call.keywords if k.arg == "status_code"), None)
        detail = _detail(call)

        assert isinstance(status, ast.Constant) and status.value >= 400, f"{path.name}:{call.lineno} status"
        assert detail is not None, f"{path.name}:{call.lineno} has no detail"
        if isinstance(detail, ast.Name):
            assert (path.name, detail.id) in HOLDS_FIXED_STRINGS, f"{path.name}:{call.lineno} detail is a variable"


@pytest.mark.parametrize("path", FILES, ids=[p.name for p in FILES])
def test_no_error_repeats_the_text_of_an_exception(path):
    for call in _http_exceptions(path):
        detail = _detail(call)
        allowed = detail is not None and (path.name, ast.unparse(detail)) in PASSES_ON_OUR_OWN_MESSAGE
        leaked = _names_used(detail) & EXCEPTION_NAMES if detail is not None and not allowed else set()

        assert not leaked, f"{path.name}:{call.lineno} puts {leaked} into what the caller sees"


def test_the_checker_notices_a_leak():
    leaky = ast.parse('raise HTTPException(status_code=500, detail=f"failed: {exc}")')
    call = next(n for n in ast.walk(leaky) if isinstance(n, ast.Call) and getattr(n.func, "id", "") == "HTTPException")

    assert _names_used(_detail(call)) & EXCEPTION_NAMES == {"exc"}


def test_our_own_file_name_check_never_puts_what_the_caller_typed_into_its_message():
    from app.main import clean_filename

    for typed in ["", "   ", "x" * 400, "bad\x00name.pdf", "tab\tname.pdf"]:
        with pytest.raises(ValueError) as refused:
            clean_filename(typed)
        message = str(refused.value)
        assert typed.strip() == "" or typed not in message
        assert "\x00" not in message and "\t" not in message


def test_the_variable_used_as_a_detail_is_only_ever_given_fixed_strings():
    tree = ast.parse((APP / "main.py").read_text())
    values = [
        node.value
        for node in ast.walk(tree)
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "problem" for t in node.targets)
    ]

    assert values and all(isinstance(value, (ast.Constant)) for value in values)
    assert all(value.value is None or isinstance(value.value, str) for value in values)
