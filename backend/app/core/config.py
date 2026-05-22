import os
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    JWT_SECRET_KEY: str = os.getenv(
        "JWT_SECRET_KEY",
        "dev-only-change-this-secret-key-before-production",
    )
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))


    SMTP_HOST: str = os.getenv("SMTP_HOST", "")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USERNAME: str = os.getenv("SMTP_USERNAME", "")
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")
    SMTP_FROM_EMAIL: str = os.getenv("SMTP_FROM_EMAIL", "")
    SMTP_FROM_NAME: str = os.getenv("SMTP_FROM_NAME", "Cloud Segura")
    SMTP_USE_TLS: bool = os.getenv("SMTP_USE_TLS", "false").lower() == "true"
    SMTP_USE_STARTTLS: bool = os.getenv("SMTP_USE_STARTTLS", "true").lower() == "true"
    SMTP_TIMEOUT_SECONDS: int = int(os.getenv("SMTP_TIMEOUT_SECONDS", "15"))

    SMTP_REQUIRE_REAL_DELIVERY: bool = os.getenv("SMTP_REQUIRE_REAL_DELIVERY", "true").lower() == "true"

    EMAIL_RETURN_CODES: bool = os.getenv("EMAIL_RETURN_CODES", "false").lower() == "true"

    KEYSERVER_INTERNAL_URL: str = os.getenv("KEYSERVER_INTERNAL_URL", "http://keyserver:9000")

    MINIO_ENDPOINT: str = os.getenv("MINIO_ENDPOINT", "localhost:9000")
    MINIO_ACCESS_KEY: str = os.getenv("MINIO_ACCESS_KEY", "minio")
    MINIO_SECRET_KEY: str = os.getenv("MINIO_SECRET_KEY", "minio123")
    MINIO_SECURE: bool = os.getenv("MINIO_SECURE", "false").lower() == "true"

    MINIO_1_ENDPOINT: str = os.getenv("MINIO_1_ENDPOINT", os.getenv("MINIO_ENDPOINT", "localhost:9000"))
    MINIO_1_ACCESS_KEY: str = os.getenv("MINIO_1_ACCESS_KEY", os.getenv("MINIO_ACCESS_KEY", "minio"))
    MINIO_1_SECRET_KEY: str = os.getenv("MINIO_1_SECRET_KEY", os.getenv("MINIO_SECRET_KEY", "minio123"))
    MINIO_1_BUCKET: str = os.getenv("MINIO_1_BUCKET", "cloud-part-1")

    MINIO_2_ENDPOINT: str = os.getenv("MINIO_2_ENDPOINT", os.getenv("MINIO_ENDPOINT", "localhost:9000"))
    MINIO_2_ACCESS_KEY: str = os.getenv("MINIO_2_ACCESS_KEY", os.getenv("MINIO_ACCESS_KEY", "minio"))
    MINIO_2_SECRET_KEY: str = os.getenv("MINIO_2_SECRET_KEY", os.getenv("MINIO_SECRET_KEY", "minio123"))
    MINIO_2_BUCKET: str = os.getenv("MINIO_2_BUCKET", "cloud-part-2")

    MINIO_3_ENDPOINT: str = os.getenv("MINIO_3_ENDPOINT", os.getenv("MINIO_ENDPOINT", "localhost:9000"))
    MINIO_3_ACCESS_KEY: str = os.getenv("MINIO_3_ACCESS_KEY", os.getenv("MINIO_ACCESS_KEY", "minio"))
    MINIO_3_SECRET_KEY: str = os.getenv("MINIO_3_SECRET_KEY", os.getenv("MINIO_SECRET_KEY", "minio123"))
    MINIO_3_BUCKET: str = os.getenv("MINIO_3_BUCKET", "cloud-part-3")

    @property
    def MINIO_NODES(self) -> list[dict[str, str]]:
        return [
            {
                "node_id": "minio1",
                "endpoint": self.MINIO_1_ENDPOINT,
                "access_key": self.MINIO_1_ACCESS_KEY,
                "secret_key": self.MINIO_1_SECRET_KEY,
                "bucket": self.MINIO_1_BUCKET,
            },
            {
                "node_id": "minio2",
                "endpoint": self.MINIO_2_ENDPOINT,
                "access_key": self.MINIO_2_ACCESS_KEY,
                "secret_key": self.MINIO_2_SECRET_KEY,
                "bucket": self.MINIO_2_BUCKET,
            },
            {
                "node_id": "minio3",
                "endpoint": self.MINIO_3_ENDPOINT,
                "access_key": self.MINIO_3_ACCESS_KEY,
                "secret_key": self.MINIO_3_SECRET_KEY,
                "bucket": self.MINIO_3_BUCKET,
            },
        ]

    @property
    def MINIO_BUCKETS(self) -> list[str]:
        return [node["bucket"] for node in self.MINIO_NODES]

    FILE_PARTS: int = 3


settings = Settings()
