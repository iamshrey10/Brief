import re
from pathlib import Path


from app.readiness import check_ready, expected_revision

MIGRATIONS = Path(__file__).resolve().parent.parent / "migrations" / "versions"


def _read(pattern: str) -> list[str]:
    found = []
    for path in MIGRATIONS.glob("*.py"):
        match = re.search(pattern, path.read_text(), re.MULTILINE)
        if match:
            found.append(match.group(1))
    return found


def test_the_expected_revision_is_the_one_migration_nothing_builds_on():
    revisions = set(_read(r"^revision(?::\s*str)?\s*=\s*['\"]([0-9a-f]+)['\"]"))
    built_on = set(_read(r"^down_revision(?::[^=]+)?\s*=\s*['\"]([0-9a-f]+)['\"]"))

    assert revisions - built_on == {expected_revision()}


class _Result:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class FakeSession:
    """Answers each query in order with a value, or raises it when it is an exception."""

    def __init__(self, *answers):
        self._answers = list(answers)
        self.asked = 0

    async def execute(self, _statement):
        self.asked += 1
        answer = self._answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return _Result(answer)


async def test_it_is_ready_when_the_database_answers_and_is_on_the_expected_migration():
    session = FakeSession(1, expected_revision())

    status = await check_ready(session)

    assert status == {"database": "ok", "migrations": "current"}


async def test_it_is_not_ready_when_the_database_cannot_be_reached_and_asks_nothing_more():
    session = FakeSession(ConnectionRefusedError("down"))

    status = await check_ready(session)

    assert status == {"database": "unreachable", "migrations": "unknown"}
    assert session.asked == 1
