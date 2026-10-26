import subprocess
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent.parent / "scripts" / "check-all.sh"


def _run(*args):
    return subprocess.run(["bash", str(SCRIPT), *args], capture_output=True, text=True, timeout=30)


def test_the_script_has_valid_shell_syntax():
    assert subprocess.run(["bash", "-n", str(SCRIPT)]).returncode == 0


def test_list_names_every_check_ci_runs_and_runs_none_of_them():
    result = _run("--list")

    assert result.returncode == 0
    assert result.stdout.splitlines() == [
        "api lint",
        "api tests with coverage",
        "quality gate",
        "web types",
        "web lint",
        "web tests with coverage",
        "web build",
    ]


def test_the_browser_tests_are_added_only_when_asked_for():
    assert "browser tests" not in _run("--list").stdout
    # with --e2e the list is not printed (that is --list), so check the stage is in the script itself
    assert 'pnpm e2e' in SCRIPT.read_text() and '"--e2e"' in SCRIPT.read_text()


def test_the_script_is_executable():
    assert SCRIPT.stat().st_mode & 0o111
