from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://brief:brief_dev_password@localhost:5432/brief"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
