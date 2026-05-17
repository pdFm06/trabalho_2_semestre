import os
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ----------------------------
    # JWT / Autenticação
    # ----------------------------
    # Em desenvolvimento há um valor por defeito. Em produção, definir sempre via variável de ambiente.
    JWT_SECRET_KEY: str = os.getenv(
        "JWT_SECRET_KEY",
        "dev-only-change-this-secret-key-before-production",
    )
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))


    # ----------------------------
    # Keyserver
    # ----------------------------
    # URL interna usada pelo backend dentro da rede Docker.
    KEYSERVER_INTERNAL_URL: str = os.getenv("KEYSERVER_INTERNAL_URL", "http://keyserver:9000")

    # ----------------------------
    # MinIO (armazenamento de objetos)
    # ----------------------------
    MINIO_ENDPOINT: str = os.getenv("MINIO_ENDPOINT", "localhost:9000")
    MINIO_ACCESS_KEY: str = os.getenv("MINIO_ACCESS_KEY", "minio")
    MINIO_SECRET_KEY: str = os.getenv("MINIO_SECRET_KEY", "minio123")
    MINIO_SECURE: bool = os.getenv("MINIO_SECURE", "false").lower() == "true"

    # Nome dos buckets onde as partes dos ficheiros serão guardadas.
    MINIO_BUCKETS: list[str] = ["bucket-part-0", "bucket-part-1", "bucket-part-2"]

    # ----------------------------
    # Divisão de ficheiros
    # ----------------------------
    FILE_PARTS: int = 3


settings = Settings()
