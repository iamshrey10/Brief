import pytest
from pydantic import ValidationError

from app.config import DEV_DATABASE_PASSWORD, DEV_SERVICE_SECRET, Settings

SETTING_NAMES = (
    "ENVIRONMENT",
    "DATABASE_URL",
    "SERVICE_JWT_SECRET",
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME",
    "R2_ENDPOINT_URL",
    "GEMINI_API_KEY",
)


@pytest.fixture(autouse=True)
def no_settings_from_the_surroundings(monkeypatch):
    """CI and a person's shell both set some of these as real environment variables, which would
    replace the defaults these tests are about. Each test starts with none of them set."""
    for name in SETTING_NAMES:
        monkeypatch.delenv(name, raising=False)


STRONG = "x" * 32
PRODUCTION_DATABASE = "postgresql+asyncpg://brief:a-real-password@db.internal:5432/brief"


def make(**values) -> Settings:
    # No .env file and explicit values, so the person's own settings never leak into a test.
    return Settings(_env_file=None, **values)


def test_development_runs_with_the_built_in_defaults():
    settings = make()

    assert settings.environment == "development"
    assert settings.service_jwt_secret == DEV_SERVICE_SECRET


def test_production_accepts_a_strong_secret_and_a_real_database_password():
    settings = make(environment="production", service_jwt_secret=STRONG, database_url=PRODUCTION_DATABASE)

    assert settings.environment == "production"


def test_production_refuses_the_built_in_secret():
    with pytest.raises(ValidationError, match="built-in development value"):
        make(environment="production", database_url=PRODUCTION_DATABASE)


@pytest.mark.parametrize("length", [1, 16, 31])
def test_production_refuses_a_secret_shorter_than_32_characters(length):
    with pytest.raises(ValidationError, match="32"):
        make(environment="production", service_jwt_secret="x" * length, database_url=PRODUCTION_DATABASE)


def test_production_accepts_a_secret_of_exactly_32_characters():
    make(environment="production", service_jwt_secret="x" * 32, database_url=PRODUCTION_DATABASE)


def test_production_refuses_the_development_database_password():
    with pytest.raises(ValidationError, match="DATABASE_URL"):
        make(environment="production", service_jwt_secret=STRONG)


def test_the_error_names_every_problem_at_once():
    with pytest.raises(ValidationError) as caught:
        make(environment="production")

    message = str(caught.value)
    assert "SERVICE_JWT_SECRET" in message and "DATABASE_URL" in message


def test_the_error_never_prints_the_secret_or_the_password():
    secret = "short-but-secret"
    url = f"postgresql+asyncpg://brief:{DEV_DATABASE_PASSWORD}@db:5432/brief"

    with pytest.raises(ValidationError) as caught:
        make(environment="production", service_jwt_secret=secret, database_url=url)

    assert secret not in str(caught.value)
    assert DEV_DATABASE_PASSWORD not in str(caught.value)


@pytest.mark.parametrize("name", ["Production", "PRODUCTION", " production "])
def test_the_environment_name_is_not_case_or_space_sensitive_so_a_typo_cannot_skip_the_checks(name):
    with pytest.raises(ValidationError):
        make(environment=name)


@pytest.mark.parametrize("name", ["Production", "PRODUCTION", " production "])
def test_a_differently_written_production_is_accepted_when_the_settings_are_strong(name):
    settings = make(environment=name, service_jwt_secret=STRONG, database_url=PRODUCTION_DATABASE)

    assert settings.environment == "production"


@pytest.mark.parametrize("name", ["prod", "live", "staging", ""])
def test_an_unknown_environment_name_is_refused_instead_of_quietly_treated_as_development(name):
    with pytest.raises(ValidationError, match="ENVIRONMENT"):
        make(environment=name, service_jwt_secret=STRONG)


@pytest.mark.parametrize("name", ["development", "test"])
def test_development_and_test_may_use_the_defaults(name):
    make(environment=name)


@pytest.mark.parametrize("environment", ["development", "test", "production"])
@pytest.mark.parametrize("blank", ["", "   "])
def test_a_blank_secret_is_refused_in_every_environment(environment, blank):
    with pytest.raises(ValidationError, match="SERVICE_JWT_SECRET is empty"):
        make(environment=environment, service_jwt_secret=blank, database_url=PRODUCTION_DATABASE)


def test_the_blank_secret_error_does_not_print_anything_secret():
    with pytest.raises(ValidationError) as caught:
        make(service_jwt_secret="   ")

    assert "input_value" not in str(caught.value)
