from collections.abc import Callable, Sequence
from typing import TypeVar

T = TypeVar("T")


def majority_of_runs(
    runs: Sequence[Sequence[T]],
    is_positive: Callable[[T], bool],
    agrees: Callable[[T, T], bool],
) -> list[T]:
    """Combines several runs over the same fields into one answer per field, by vote.

    The same document read twice by a model can come out differently, so each field is kept only
    if MORE than half of the runs found it. When it is kept, the entry returned is the one that the
    most other positive runs agree with, and the earliest run wins a tie. A field most runs missed
    comes back as the first run's miss. The runs are not changed.

    Voting makes the result steadier, it does not make it more accurate: a mistake the model makes
    in most runs is still a mistake.
    """
    if not runs:
        raise ValueError("there must be at least one run")
    width = len(runs[0])
    if any(len(run) != width for run in runs):
        raise ValueError("every run must cover the same fields")

    combined: list[T] = []
    for position in range(width):
        entries = [run[position] for run in runs]
        positives = [entry for entry in entries if is_positive(entry)]
        if len(positives) * 2 > len(runs):
            support = [sum(1 for other in positives if agrees(entry, other)) for entry in positives]
            combined.append(positives[support.index(max(support))])
        else:
            combined.append(next(entry for entry in entries if not is_positive(entry)))
    return combined
