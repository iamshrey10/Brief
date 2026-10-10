from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Known values that exist only so a laptop works without setup. They are public in this repository,
# so a server that still uses one has no secret at all.
DEV_SERVICE_SECRET = "dev-only-secret-change-me"
DEV_DATABASE_PASSWORD = "brief_dev_password"

ENVIRONMENTS = ("development", "test", "production")
MIN_SECRET_LENGTH = 32


class Settings(BaseSettings):
    # development, test, or production. Production refuses to start with the built-in secrets.
    environment: str = "development"

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
