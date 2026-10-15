import pytest

from app.request_id import accept_or_make


def test_a_sensible_id_from_the_caller_is_kept_so_both_sides_log_the_same_one():
    assert accept_or_make("3f2b8c1e-9d4a-4e07-8a55-0c1d2e3f4a5b") == "3f2b8c1e-9d4a-4e07-8a55-0c1d2e3f4a5b"


@pytest.mark.parametrize("missing", [None, ""])
def test_a_new_id_is_made_when_the_caller_sent_none(missing):
    made = accept_or_make(missing)

    assert len(made) == 32
    assert made.isalnum()


def test_two_new_ids_are_never_the_same():
    assert accept_or_make(None) != accept_or_make(None)


@pytest.mark.parametrize(
    "hostile",
    [
        "abc\nINFO: fake line",
        "a" * 65,
        "short",
        "has spaces in it 123",
        "semi;colon-12345678",
        "<script>alert(1)</script>",
    ],
)
def test_an_id_that_could_forge_a_log_line_or_is_too_long_or_short_is_replaced(hostile):
    made = accept_or_make(hostile)

    assert made != hostile
    assert len(made) == 32
