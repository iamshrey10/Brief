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
