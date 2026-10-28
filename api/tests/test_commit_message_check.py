import subprocess
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[2] / "scripts"
CHECK = SCRIPTS / "check-commit-messages.sh"
INSTALL = SCRIPTS / "install-hooks.sh"
CREDIT = "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"


def _run(cmd, cwd, **kwargs):
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, **kwargs)


def _repo(tmp_path, *messages):
    _run(["git", "init", "-q"], tmp_path)
    for message in messages:
        commit = ["git", "-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q",
                  "--allow-empty", "--no-verify", "-m", message]
        assert _run(commit, tmp_path).returncode == 0
    return tmp_path


def test_a_history_with_no_credit_passes(tmp_path):
    repo = _repo(tmp_path, "Add a thing", "Explain how the Claude API client retries a call")

    result = _run([str(CHECK)], repo)

    assert result.returncode == 0
    assert "no commit message credits an AI tool" in result.stdout


def test_a_credit_trailer_in_an_old_commit_fails_and_names_that_commit(tmp_path):
    repo = _repo(tmp_path, f"Scroll to the quote\n\n{CREDIT}", "A later clean commit")

    result = _run([str(CHECK)], repo)

    assert result.returncode == 1
    assert "Scroll to the quote" in result.stdout
    assert "later clean commit" not in result.stdout


def test_a_generated_with_line_fails(tmp_path):
    repo = _repo(tmp_path, "Add it\n\nGenerated with [Claude Code](https://claude.com/claude-code)")

    assert _run([str(CHECK)], repo).returncode == 1


def test_one_message_file_is_judged_on_its_own(tmp_path):
    clean = tmp_path / "clean.txt"
    credited = tmp_path / "credited.txt"
    clean.write_text("Fix a thing\n\nBody text.\n")
    credited.write_text(f"Fix a thing\n\n{CREDIT}\n")

    assert _run([str(CHECK), "--message-file", str(clean)], tmp_path).returncode == 0
    refused = _run([str(CHECK), "--message-file", str(credited)], tmp_path)
    assert refused.returncode == 1
    assert "credits an AI tool" in refused.stderr


def test_the_installed_hook_refuses_a_real_commit_that_credits_a_tool(tmp_path):
    repo = _repo(tmp_path)
    assert _run([str(INSTALL)], repo).returncode == 0
    base = ["git", "-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "--allow-empty"]

    refused = _run([*base, "-m", f"Add it\n\n{CREDIT}"], repo)
    allowed = _run([*base, "-m", "Add it"], repo)

    assert refused.returncode != 0
    assert "credits an AI tool" in refused.stderr
    assert allowed.returncode == 0
