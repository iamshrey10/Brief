import pytest

from app.consensus import majority_of_runs


def positive(item: dict) -> bool:
    return item["found"]


def agree(a: dict, b: dict) -> bool:
    return a["value"] == b["value"]


def item(found: bool, value: str = "", tag: str = "") -> dict:
    return {"found": found, "value": value, "tag": tag}


def test_it_keeps_a_field_most_runs_found_and_drops_one_most_runs_missed():
    runs = [
        [item(True, "6%"), item(False)],
        [item(True, "6%"), item(True, "$5")],
        [item(False), item(False)],
    ]

    result = majority_of_runs(runs, positive, agree)

    assert result[0]["found"] and result[0]["value"] == "6%"  # 2 of 3 found it
    assert not result[1]["found"]  # only 1 of 3 found it


def test_a_field_found_by_only_one_run_is_not_kept():
    runs = [[item(True, "x")], [item(False)], [item(False)]]

    assert not majority_of_runs(runs, positive, agree)[0]["found"]


def test_it_picks_the_value_most_found_runs_agree_on():
    runs = [[item(True, "6%")], [item(True, "7%")], [item(True, "7%")]]

    assert majority_of_runs(runs, positive, agree)[0]["value"] == "7%"


def test_when_agreement_ties_the_earliest_run_wins():
    runs = [[item(True, "A", "first")], [item(True, "B", "second")], [item(True, "C", "third")]]

    assert majority_of_runs(runs, positive, agree)[0]["tag"] == "first"


def test_it_returns_one_entry_per_field_in_order():
    runs = [[item(True, "a"), item(True, "b"), item(True, "c")]] * 3

    assert [r["value"] for r in majority_of_runs(runs, positive, agree)] == ["a", "b", "c"]


def test_a_single_run_is_returned_as_it_is():
    runs = [[item(True, "a"), item(False)]]

    result = majority_of_runs(runs, positive, agree)

    assert (result[0]["value"], result[1]["found"]) == ("a", False)


def test_with_two_runs_both_must_find_it():
    assert majority_of_runs([[item(True, "a")], [item(False)]], positive, agree)[0]["found"] is False
    assert majority_of_runs([[item(True, "a")], [item(True, "a")]], positive, agree)[0]["found"] is True


def test_it_does_not_change_the_runs_it_is_given():
    runs = [[item(True, "a")], [item(False)], [item(True, "a")]]
    before = [[dict(entry) for entry in run] for run in runs]

    majority_of_runs(runs, positive, agree)

    assert runs == before


def test_it_needs_at_least_one_run():
    with pytest.raises(ValueError):
        majority_of_runs([], positive, agree)


def test_every_run_must_cover_the_same_fields():
    with pytest.raises(ValueError):
        majority_of_runs([[item(True, "a")], [item(True, "a"), item(False)]], positive, agree)


def test_the_kept_entry_for_a_missed_field_comes_from_a_run_that_missed_it():
    runs = [[item(True, "x", "found-it")], [item(False, "", "missed-1")], [item(False, "", "missed-2")]]

    assert majority_of_runs(runs, positive, agree)[0]["tag"] == "missed-1"
