from pathlib import Path

from app.config import Settings

EXAMPLE = Path(__file__).resolve().parent.parent / ".env.example"


def _names_in_the_example() -> list[str]:
    names = []
    for line in EXAMPLE.read_text().splitlines():
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in stripped:
            names.append(stripped.split("=", 1)[0].strip())
    return names


def test_every_setting_the_server_reads_has_an_entry_in_the_example():
    needed = {name.upper() for name in Settings.model_fields}

    assert needed - set(_names_in_the_example()) == set()


def test_the_example_lists_nothing_the_server_does_not_read():
    needed = {name.upper() for name in Settings.model_fields}

    assert set(_names_in_the_example()) - needed == set()


def test_no_setting_appears_twice():
    names = _names_in_the_example()

    assert len(names) == len(set(names))


def test_the_example_holds_no_real_looking_secret():
    for line in EXAMPLE.read_text().splitlines():
        stripped = line.strip()
        if stripped.startswith("#") or "=" not in stripped:
            continue
        name, value = stripped.split("=", 1)
        if "SECRET" in name or "KEY" in name or "PASSWORD" in name:
            assert value.strip() == "" or value.strip().startswith("change-me"), (
                f"{name} has a value that could be a real secret"
            )
