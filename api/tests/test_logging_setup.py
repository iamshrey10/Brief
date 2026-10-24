import logging

import pytest

from app.logging_setup import configure_logging


@pytest.fixture(autouse=True)
def clean_app_logger():
    """Each test starts with the app's logger as the library leaves it, and puts it back after."""
    logger = logging.getLogger("app")
    handlers, level, propagate = list(logger.handlers), logger.level, logger.propagate
    logger.handlers.clear()
    logger.setLevel(logging.NOTSET)
    yield logger
    logger.handlers[:] = handlers
    logger.setLevel(level)
    logger.propagate = propagate


def test_the_apps_own_info_lines_are_shown_once_logging_is_set_up(clean_app_logger, capsys):
    configure_logging()

    logging.getLogger("app.telemetry").info("model call answer ok in 2.5s")

    assert "model call answer ok in 2.5s" in capsys.readouterr().err


def test_a_line_names_the_part_of_the_app_it_came_from(clean_app_logger, capsys):
    configure_logging()

    logging.getLogger("app.telemetry").info("hello")

    assert "app.telemetry" in capsys.readouterr().err


def test_calling_it_twice_does_not_print_every_line_twice(clean_app_logger, capsys):
    configure_logging()
    configure_logging()

    logging.getLogger("app.telemetry").info("only once please")

    assert capsys.readouterr().err.count("only once please") == 1
    assert len(clean_app_logger.handlers) == 1


def test_it_only_turns_on_the_apps_own_logger_and_leaves_libraries_quiet(clean_app_logger):
    root_level = logging.getLogger().level

    configure_logging()

    assert clean_app_logger.level == logging.INFO
    assert logging.getLogger().level == root_level  # httpx and google libraries stay at their own level
    assert logging.getLogger("httpx").getEffectiveLevel() >= logging.WARNING


def test_debug_lines_are_still_hidden(clean_app_logger, capsys):
    configure_logging()

    logging.getLogger("app.telemetry").debug("too chatty")

    assert "too chatty" not in capsys.readouterr().err


def test_the_lines_still_reach_the_root_so_tests_and_other_handlers_can_see_them(clean_app_logger, caplog):
    configure_logging()

    with caplog.at_level(logging.INFO):
        logging.getLogger("app.telemetry").info("model call judge ok in 1.0s")

    assert "model call judge ok in 1.0s" in caplog.text


def test_importing_the_app_sets_logging_up_in_a_fresh_interpreter():
    """A fresh Python, so nothing an earlier test did can make this pass by accident."""
    import subprocess
    import sys

    result = subprocess.run(
        [
            sys.executable,
            "-c",
            "import logging, app.main; logger = logging.getLogger('app'); "
            "print(logger.level, len(logger.handlers))",
        ],
        capture_output=True,
        text=True,
        timeout=60,
    )

    assert result.stdout.split()[-2:] == [str(logging.INFO), "1"], result.stderr


def test_a_line_written_while_handling_a_request_carries_that_requests_id(clean_app_logger, capsys):
    from app import request_id

    configure_logging()
    token = request_id.current.set("req-abc12345")
    try:
        logging.getLogger("app.qa").info("answering")
    finally:
        request_id.current.reset(token)

    assert "req-abc12345" in capsys.readouterr().err


def test_a_line_written_outside_any_request_shows_a_dash_instead_of_an_id(clean_app_logger, capsys):
    configure_logging()

    logging.getLogger("app.qa").info("starting up")

    assert "[-]" in capsys.readouterr().err


def test_json_format_writes_one_json_object_per_line_with_the_request_id(clean_app_logger, capsys):
    import json

    from app import request_id

    configure_logging("json")
    token = request_id.current.set("req-abc12345")
    try:
        logging.getLogger("app.qa").info("answering")
    finally:
        request_id.current.reset(token)

    line = capsys.readouterr().err.strip()
    entry = json.loads(line)
    assert entry["message"] == "answering"
    assert (entry["level"], entry["logger"], entry["request_id"]) == ("INFO", "app.qa", "req-abc12345")
    assert entry["time"].endswith("+00:00")


def test_json_format_keeps_a_new_line_inside_the_message_on_one_line(clean_app_logger, capsys):
    import json

    configure_logging("json")
    logging.getLogger("app.qa").info("first\nsecond")

    lines = capsys.readouterr().err.strip().splitlines()
    assert len(lines) == 1
    assert json.loads(lines[0])["message"] == "first\nsecond"


def test_json_format_names_the_type_of_an_error_and_never_its_message_or_trace(clean_app_logger, capsys):
    import json

    configure_logging("json")
    try:
        raise ValueError("a private contract sentence")
    except ValueError:
        logging.getLogger("app.ingestion").exception("ingestion failed")

    text = capsys.readouterr().err
    assert json.loads(text.strip())["error_type"] == "ValueError"
    assert "private contract sentence" not in text and "Traceback" not in text


def test_an_unknown_log_format_is_refused(clean_app_logger):
    import pytest

    with pytest.raises(ValueError, match="text or json"):
        configure_logging("xml")
