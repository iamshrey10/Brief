"""Every link in the documentation that points at a file in this repository must point at a file that exists."""

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
DOCS = sorted(
    [ROOT / "README.md", ROOT / "STATUS.md", *ROOT.glob("*/README.md"), *ROOT.glob("docs/*.md"), *ROOT.glob("infra/*.md")]
)
LINK = re.compile(r"\[[^\]]*\]\(([^)\s]+)\)")


def _local_links(path: Path) -> list[str]:
    text = re.sub(r"```.*?```", "", path.read_text(), flags=re.DOTALL)  # not what is shown as an example
    found = []
    for target in LINK.findall(text):
        if target.startswith(("http://", "https://", "mailto:", "#")):
            continue
        found.append(target.split("#")[0])
    return found


def test_it_finds_the_documents_it_is_meant_to_check():
    names = {path.relative_to(ROOT).as_posix() for path in DOCS}

    assert {"README.md", "STATUS.md", "docs/ARCHITECTURE.md", "docs/MANUAL-TEST.md", "infra/DEPLOY.md"} <= names


@pytest.mark.parametrize("doc", DOCS, ids=[p.relative_to(ROOT).as_posix() for p in DOCS])
def test_every_local_link_points_at_a_file_that_exists(doc):
    broken = [target for target in _local_links(doc) if not (doc.parent / target).exists()]

    assert broken == [], f"{doc.relative_to(ROOT)} links to missing files: {broken}"


def test_the_checker_itself_notices_a_broken_link(tmp_path):
    page = tmp_path / "page.md"
    page.write_text("See [the guide](docs/missing.md), [the site](https://example.com) and [here](#top).")

    assert _local_links(page) == ["docs/missing.md"]
    assert not (page.parent / "docs/missing.md").exists()
