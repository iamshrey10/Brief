"""The quality gate: fails when a recorded evaluation result is below its minimum.

Reads the newest committed report of each evaluation in `results/`, takes the numbers that matter out of
it, and compares each to the limit in `thresholds.json`. It needs no model and no secret, so it runs on
every push. It checks the committed reports, so a change that makes answers worse is caught once the
evaluations are run again and their new reports are committed, which README.md says to do.

A report or a line that is missing is an error and never a pass, a limit that matches no number is an
error so a typo cannot hide a check, and a number with no limit is an error so a new one is not left
unchecked.

    python evals/check_results.py [--results evals/results] [--thresholds evals/thresholds.json]
"""

import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent


class GateError(Exception):
    """A report or a line the gate needs is missing, so nothing can be said about it."""


# For each metric: the kind of report, the row or line to read, and where in the report it is.
#   table  a markdown table row whose first cell is `label`, taking the cell at `column`
#   line   a line containing `label`
METRICS = {
    "retrieval_hybrid_hit_at_1": ("retrieval", "table", "hybrid (keyword + vector)", 1),
    "qa_cited_right_clause": ("qa", "table", "Cited the right clause", 1),
    "qa_hallucinated": ("qa", "table", "Hallucinated an answer", 1),
    "qa_correctly_abstained": ("qa", "table", "Correctly said it couldn't find it", 1),
    "key_terms_right": ("key-terms", "table", "Right clause and right value", 1),
    "key_terms_invented": ("key-terms", "table", "Invented a value", 1),
    "checklist_right": ("checklist", "table", "Right clause and right answer", 1),
    "checklist_invented": ("checklist", "table", "Invented an answer", 1),
    "checklist_gaps_flagged": ("checklist", "line", "flagged as a gap", None),
}


def latest_report(results: Path, kind: str) -> Path:
    """The newest dated report of this kind, by its date and not by its text."""
    pattern = re.compile(rf"^{re.escape(kind)}-(\d{{4}})-(\d{{2}})-(\d{{2}})\.md$")
    dated = []
    for path in results.glob(f"{kind}-*.md"):
        match = pattern.match(path.name)
        if match:
            dated.append((date(*map(int, match.groups())), path))
    if not dated:
        raise GateError(f"no {kind} report in {results}")
    return max(dated)[1]


def percent_in(text: str) -> float:
    """The percentage in a cell like `100% (24/24)`. When the counts are there they win, since they
    are what the percentage was rounded from."""
    counts = re.search(r"\((\d+)/(\d+)\)", text)
    if counts and int(counts.group(2)) > 0:
        return 100.0 * int(counts.group(1)) / int(counts.group(2))
    plain = re.search(r"(\d+(?:\.\d+)?)%", text)
    if not plain:
        raise GateError(f"no percentage in {text!r}")
    return float(plain.group(1))


def read_metric(report: Path, how: str, label: str, column: int | None) -> float:
    for line in report.read_text().splitlines():
        if how == "table" and line.startswith("|"):
            cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
            if cells and cells[0] == label:
                return percent_in(cells[column])
        if how == "line" and label in line:
            return percent_in(line)
    raise GateError(f"{report.name} has no {label!r} line")


def read_metrics(results: Path) -> dict[str, float]:
    return {
        name: read_metric(latest_report(results, kind), how, label, column)
        for name, (kind, how, label, column) in METRICS.items()
    }


def check(metrics: dict[str, float], thresholds: dict[str, dict[str, float]]) -> list[str]:
    """What is wrong, one sentence each. Nothing to report means every number holds."""
    problems = []
    for name in thresholds.keys() - metrics.keys():
        problems.append(f"{name}: there is a limit but no such number is read from the reports")
    for name in metrics.keys() - thresholds.keys():
        problems.append(f"{name}: a number is read from the reports but it has no limit")
    for name in sorted(metrics.keys() & thresholds.keys()):
        value, limits = metrics[name], thresholds[name]
        if "min" in limits and value < limits["min"]:
            problems.append(f"{name}: {value:g} is below the minimum of {limits['min']:g}")
        if "max" in limits and value > limits["max"]:
            problems.append(f"{name}: {value:g} is above the maximum of {limits['max']:g}")
    return problems


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--results", type=Path, default=HERE / "results")
    parser.add_argument("--thresholds", type=Path, default=HERE / "thresholds.json")
    args = parser.parse_args(argv)

    try:
        metrics = read_metrics(args.results)
    except GateError as error:
        print(f"FAIL: {error}")
        return 1
    problems = check(metrics, json.loads(args.thresholds.read_text()))
    for name in sorted(metrics):
        print(f"  {name}: {metrics[name]:g}")
    if problems:
        print("\nFAIL:")
        for problem in problems:
            print(f"  {problem}")
        return 1
    print("\nOK: every recorded evaluation result meets its limit.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
