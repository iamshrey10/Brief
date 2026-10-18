import ast
from pathlib import Path

from app.main import app

TAGS = {"health", "account", "documents", "answers"}


def _operations() -> list[tuple[str, str, dict]]:
    spec = app.openapi()
    return [
        (method.upper(), path, operation)
        for path, methods in spec["paths"].items()
        for method, operation in methods.items()
    ]


def test_it_finds_the_routes_it_is_meant_to_check():
    assert len(_operations()) >= 19


def test_every_route_belongs_to_exactly_one_known_group():
    for method, path, operation in _operations():
        assert len(operation.get("tags", [])) == 1, f"{method} {path} has no single group"
        assert operation["tags"][0] in TAGS, f"{method} {path} is in an unknown group"


def test_every_group_that_is_used_is_described():
    described = {tag["name"]: tag.get("description", "") for tag in app.openapi().get("tags", [])}
    used = {operation["tags"][0] for _, _, operation in _operations()}

    for tag in used:
        assert described.get(tag), f"the {tag} group has no description"


def test_every_route_has_a_summary_written_for_a_person_and_a_description():
    for method, path, operation in _operations():
        summary = operation.get("summary", "")
        # With none written, FastAPI makes "Get Document" from the function name: Title Case, two words.
        assert len(summary.split()) >= 3 and summary != summary.title(), (
            f"{method} {path} has no written summary: {summary!r}"
        )
        assert len(operation.get("description", "")) >= 30, f"{method} {path} has no real description"


def test_the_api_describes_itself():
    info = app.openapi()["info"]

    assert info["title"] == "Brief API"
    assert len(info.get("description", "")) >= 60


# --- the error answers each route documents are the ones its code can really give ---

_MAIN = ast.parse((Path(__file__).resolve().parent.parent / "app" / "main.py").read_text())
_FUNCTIONS = {
    node.name: node for node in _MAIN.body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
}


def _own_codes_and_calls(function) -> tuple[set[int], set[str]]:
    codes: set[int] = set()
    calls: set[str] = set()
    for node in ast.walk(function):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            calls.add(node.func.id)
            if node.func.id == "HTTPException":
                for keyword in node.keywords:
                    if keyword.arg == "status_code" and isinstance(keyword.value, ast.Constant):
                        codes.add(keyword.value.value)
    for default in [*function.args.defaults, *function.args.kw_defaults]:
        if default is not None:
            calls.update(sub.id for sub in ast.walk(default) if isinstance(sub, ast.Name))
    return codes, calls


def _codes_raised(name: str, seen: frozenset[str] = frozenset()) -> set[int]:
    if name in seen or name not in _FUNCTIONS:
        return set()
    codes, calls = _own_codes_and_calls(_FUNCTIONS[name])
    for called in calls:
        if called != name:
            codes |= _codes_raised(called, seen | {name})
    return codes


def _routes() -> list[tuple[str, str, str, bool]]:
    """(method, path, function name, needs sign in) for every route in main.py."""
    found = []
    for node in _MAIN.body:
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        for decorator in node.decorator_list:
            if (
                isinstance(decorator, ast.Call)
                and isinstance(decorator.func, ast.Attribute)
                and isinstance(decorator.func.value, ast.Name)
                and decorator.func.value.id == "app"
                and decorator.func.attr in {"get", "post", "patch", "delete"}
            ):
                needs_sign_in = "get_current_user" in _own_codes_and_calls(node)[1]
                found.append((decorator.func.attr.upper(), decorator.args[0].value, node.name, needs_sign_in))
    return found


def test_it_finds_every_route_in_the_source():
    assert len(_routes()) == len(_operations())


def test_every_error_a_route_can_raise_is_documented_on_it():
    spec = app.openapi()["paths"]
    for method, path, name, needs_sign_in in _routes():
        documented = {int(code) for code in spec[path][method.lower()]["responses"]}
        expected = _codes_raised(name) | ({401} if needs_sign_in else set())
        missing = expected - documented
        assert not missing, f"{method} {path} can answer {sorted(missing)} but does not document it"


def test_a_route_documents_no_error_it_cannot_give():
    spec = app.openapi()["paths"]
    for method, path, name, needs_sign_in in _routes():
        documented = {
            int(code)
            for code in spec[path][method.lower()]["responses"]
            if int(code) >= 400 and int(code) != 422  # 422 is FastAPI's own check of the request shape
        }
        possible = _codes_raised(name) | ({401} if needs_sign_in else set())
        extra = documented - possible
        assert not extra, f"{method} {path} documents {sorted(extra)} but cannot answer it"


def test_each_documented_error_says_what_it_means():
    for path, methods in app.openapi()["paths"].items():
        for method, operation in methods.items():
            for code, response in operation["responses"].items():
                if int(code) >= 400 and int(code) != 422:
                    assert len(response.get("description", "")) >= 20, f"{method} {path} {code}"
