import re
from pathlib import Path

from app.readiness import expected_revision

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
