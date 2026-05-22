from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL:    str = "postgresql://keyuser:keypassword@keydb:5432/keydb"
    JWT_SECRET_KEY:  str = "dev-only-change-this-secret-key-before-production"
    JWT_ALGORITHM:   str = "HS256"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
