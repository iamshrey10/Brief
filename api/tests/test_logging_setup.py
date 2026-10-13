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
