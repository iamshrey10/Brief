"""The gate that fails the build when a recorded evaluation result falls below its minimum."""

import importlib.util
import json
from pathlib import Path

import pytest

EVALS = Path(__file__).resolve().parent.parent.parent / "evals"
spec = importlib.util.spec_from_file_location("check_results", EVALS / "check_results.py")
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)

RETRIEVAL = """# Retrieval
| Strategy | hit@1 | hit@3 | MRR |
|---|---|---|---|
| keyword only | 4% | 4% | 0.04 |
| hybrid (keyword + vector) | {hybrid}% | 100% | 0.98 |
| hybrid + rerank (MiniLM) | 67% | 83% | 0.79 |
"""
QA = """# QA
| Outcome | Count |
|---|---|
| Cited the right clause | {right} |
| Hallucinated an answer | {bad} |
| Correctly said it couldn't find it | {abstain} |
"""
KEY_TERMS = """# Key terms
| Outcome | Count |
|---|---|
| Right clause and right value | {right} |
| Invented a value | {bad} |
"""
CHECKLIST = """# Checklist
| Outcome | Count |
|---|---|
| Right clause and right answer | {right} |
| Invented an answer | {bad} |

- Important questions the document does not answer, flagged as a gap: {gaps}.
"""


def write_reports(folder: Path, day="2026-10-08", hybrid=96, right="100% (24/24)", bad="0% (0/8)", gaps="100% (12/12)"):
    (folder / f"retrieval-{day}.md").write_text(RETRIEVAL.format(hybrid=hybrid))
    (folder / f"qa-{day}.md").write_text(QA.format(right=right, bad=bad, abstain="100% (8/8)"))
    (folder / f"key-terms-{day}.md").write_text(KEY_TERMS.format(right="100% (39/39)", bad="0% (0/30)"))
    (folder / f"checklist-{day}.md").write_text(CHECKLIST.format(right="100% (39/39)", bad="0% (0/21)", gaps=gaps))


def test_the_numbers_are_read_from_each_kind_of_report(tmp_path):
    write_reports(tmp_path)

    metrics = gate.read_metrics(tmp_path)

    assert metrics == {
        "retrieval_hybrid_hit_at_1": 96.0,
        "qa_cited_right_clause": 100.0,
        "qa_hallucinated": 0.0,
        "qa_correctly_abstained": 100.0,
        "key_terms_right": 100.0,
        "key_terms_invented": 0.0,
        "checklist_right": 100.0,
        "checklist_invented": 0.0,
        "checklist_gaps_flagged": 100.0,
    }


def test_the_newest_report_of_each_kind_is_the_one_used(tmp_path):
    write_reports(tmp_path, day="2026-10-01", right="50% (12/24)")
    write_reports(tmp_path, day="2026-10-08", right="100% (24/24)")

    assert gate.read_metrics(tmp_path)["qa_cited_right_clause"] == 100.0


def test_dates_are_compared_as_dates_not_as_text(tmp_path):
    write_reports(tmp_path, day="2026-09-30", right="10% (1/10)")
    write_reports(tmp_path, day="2026-10-02", right="100% (24/24)")

    assert gate.read_metrics(tmp_path)["qa_cited_right_clause"] == 100.0


def test_a_steadiness_report_is_not_mistaken_for_one_of_the_evaluations(tmp_path):
    write_reports(tmp_path)
    (tmp_path / "steadiness-2026-10-10-lease.md").write_text("# Steadiness\n| Way | Found |\n")

    assert gate.read_metrics(tmp_path)["qa_cited_right_clause"] == 100.0


def test_a_file_that_only_starts_like_a_report_is_ignored(tmp_path):
    write_reports(tmp_path, day="2026-10-08", right="100% (24/24)")
    # Newer by date, but not a dated report: a draft and some notes must not replace the real one.
    (tmp_path / "qa-2026-10-20-draft.md").write_text(QA.format(right="1% (1/100)", bad="0% (0/8)", abstain="100% (8/8)"))
    (tmp_path / "qa-2026-10-21.md.bak").write_text("junk")

    assert gate.read_metrics(tmp_path)["qa_cited_right_clause"] == 100.0


def test_a_missing_kind_of_report_is_an_error_not_a_pass(tmp_path):
    write_reports(tmp_path)
    next(tmp_path.glob("qa-*.md")).unlink()

    with pytest.raises(gate.GateError, match="qa"):
        gate.read_metrics(tmp_path)


def test_a_report_without_the_expected_line_is_an_error_not_a_pass(tmp_path):
    write_reports(tmp_path)
    (tmp_path / "qa-2026-10-08.md").write_text("# QA\nnothing useful here\n")

    with pytest.raises(gate.GateError, match="Cited the right clause"):
        gate.read_metrics(tmp_path)


def test_a_percentage_is_taken_from_the_counts_when_both_are_there(tmp_path):
    write_reports(tmp_path, right="100% (23/24)")  # the words say 100, the counts say about 96

    assert gate.read_metrics(tmp_path)["qa_cited_right_clause"] == pytest.approx(95.83, abs=0.01)


def test_nothing_is_flagged_when_every_number_meets_its_threshold():
    metrics = {"a": 96.0, "b": 0.0}
    thresholds = {"a": {"min": 90}, "b": {"max": 0}}

    assert gate.check(metrics, thresholds) == []


def test_a_number_below_its_minimum_is_flagged_with_both_numbers():
    failures = gate.check({"a": 80.0}, {"a": {"min": 90}})

    assert len(failures) == 1 and "a" in failures[0] and "80" in failures[0] and "90" in failures[0]


def test_a_number_above_its_maximum_is_flagged():
    failures = gate.check({"b": 4.2}, {"b": {"max": 0}})

    assert len(failures) == 1 and "b" in failures[0]


def test_a_number_exactly_on_its_threshold_passes():
    assert gate.check({"a": 90.0, "b": 0.0}, {"a": {"min": 90}, "b": {"max": 0}}) == []


def test_a_threshold_with_no_matching_number_is_flagged_so_a_typo_cannot_hide_a_check():
    failures = gate.check({"a": 99.0}, {"a": {"min": 90}, "typo": {"min": 90}})

    assert len(failures) == 1 and "typo" in failures[0]


def test_a_number_with_no_threshold_is_flagged_so_a_new_metric_is_not_left_unchecked():
    failures = gate.check({"a": 99.0, "new": 50.0}, {"a": {"min": 90}})

    assert len(failures) == 1 and "new" in failures[0]


def test_the_real_thresholds_cover_every_metric_and_the_real_reports_meet_them():
    thresholds = json.loads((EVALS / "thresholds.json").read_text())
    metrics = gate.read_metrics(EVALS / "results")

    assert set(thresholds) == set(metrics)
    assert gate.check(metrics, thresholds) == []


def test_a_bad_outcome_may_never_be_above_zero_in_the_real_thresholds():
    thresholds = json.loads((EVALS / "thresholds.json").read_text())

    for name in ("qa_hallucinated", "key_terms_invented", "checklist_invented"):
        assert thresholds[name] == {"max": 0}


def test_main_exits_non_zero_when_something_fell(tmp_path, capsys):
    write_reports(tmp_path, hybrid=50)
    thresholds = tmp_path / "thresholds.json"
    thresholds.write_text(json.dumps(json.loads((EVALS / "thresholds.json").read_text())))

    code = gate.main(["--results", str(tmp_path), "--thresholds", str(thresholds)])

    assert code == 1
    assert "retrieval_hybrid_hit_at_1" in capsys.readouterr().out


def test_main_exits_zero_when_everything_holds(tmp_path, capsys):
    write_reports(tmp_path)
    thresholds = tmp_path / "thresholds.json"
    thresholds.write_text((EVALS / "thresholds.json").read_text())

    assert gate.main(["--results", str(tmp_path), "--thresholds", str(thresholds)]) == 0
    assert "ok" in capsys.readouterr().out.lower()
