from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Known values that exist only so a laptop works without setup. They are public in this repository,
# so a server that still uses one has no secret at all.
DEV_SERVICE_SECRET = "dev-only-secret-change-me"
DEV_DATABASE_PASSWORD = "brief_dev_password"

ENVIRONMENTS = ("development", "test", "production")
LOG_FORMATS = ("text", "json")
MIN_SECRET_LENGTH = 32


# Query options a hosted Postgres such as Neon puts on its address that the asyncpg driver does not take.
_DROPPED_DATABASE_OPTIONS = ("channel_binding",)


def async_database_url(url: str) -> str:
    """The address as the async driver needs it, so a host's address can be pasted as it is given.

    `postgres://` and `postgresql://` become `postgresql+asyncpg://`, `sslmode=require` becomes the driver's
    `ssl=require`, and `channel_binding`, which the driver does not take, is dropped. The user, password, host and
    database name are left exactly as they were.
    """
    parts = urlsplit(url.strip())
    scheme = "postgresql+asyncpg" if parts.scheme in ("postgres", "postgresql") else parts.scheme
    options = []
    has_ssl = any(key == "ssl" for key, _ in parse_qsl(parts.query))
    for key, value in parse_qsl(parts.query, keep_blank_values=True):
        if key in _DROPPED_DATABASE_OPTIONS:
            continue
        if key == "sslmode":
            if not has_ssl:
                options.append(("ssl", value))
            continue
        options.append((key, value))
    return urlunsplit((scheme, parts.netloc, parts.path, urlencode(options), parts.fragment))


class Settings(BaseSettings):
    # development, test, or production. Production refuses to start with the built-in secrets.
    environment: str = "development"

    # text for a person reading a terminal, json for a host that collects logs: one object a line.
    log_format: str = "text"

    database_url: str = f"postgresql+asyncpg://brief:{DEV_DATABASE_PASSWORD}@localhost:5432/brief"
    service_jwt_secret: str = DEV_SERVICE_SECRET

    r2_account_id: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket_name: str = "brief-documents"
    r2_endpoint_url: str = ""

    gemini_api_key: str = ""

    # A failed check must name the setting, never print its value, so a secret cannot end up in a log.
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", hide_input_in_errors=True)

    @field_validator("environment")
    @classmethod
    def _known_environment(cls, value: str) -> str:
        name = value.strip().lower()
        if name not in ENVIRONMENTS:
            raise ValueError(f"ENVIRONMENT must be one of {', '.join(ENVIRONMENTS)}")
        return name

    @field_validator("database_url")
    @classmethod
    def _async_driver_address(cls, value: str) -> str:
        return async_database_url(value)

    @field_validator("log_format")
    @classmethod
    def _known_log_format(cls, value: str) -> str:
        name = value.strip().lower()
        if name not in LOG_FORMATS:
            raise ValueError(f"LOG_FORMAT must be one of {', '.join(LOG_FORMATS)}")
        return name

    @model_validator(mode="after")
    def _a_secret_must_exist(self) -> "Settings":
        # A blank value usually means .env.example was copied and never filled in. Signing tokens with
        # an empty key would work, and anyone could forge one, so it is refused everywhere.
        if not self.service_jwt_secret.strip():
            raise ValueError("SERVICE_JWT_SECRET is empty, set it in .env")
        return self

    @model_validator(mode="after")
    def _production_needs_real_secrets(self) -> "Settings":
        if self.environment != "production":
            return self
        problems = []
        if self.service_jwt_secret == DEV_SERVICE_SECRET:
            problems.append("SERVICE_JWT_SECRET is still the built-in development value")
        elif len(self.service_jwt_secret) < MIN_SECRET_LENGTH:
            problems.append(f"SERVICE_JWT_SECRET must be at least {MIN_SECRET_LENGTH} characters")
        if DEV_DATABASE_PASSWORD in self.database_url:
            problems.append("DATABASE_URL still uses the development database password")
        if problems:
            raise ValueError("unsafe production settings: " + "; ".join(problems))
        return self


settings = Settings()
