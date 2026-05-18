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
    # Compatibilidade com a configuração antiga de um único MinIO.
    MINIO_ENDPOINT: str = os.getenv("MINIO_ENDPOINT", "localhost:9000")
    MINIO_ACCESS_KEY: str = os.getenv("MINIO_ACCESS_KEY", "minio")
    MINIO_SECRET_KEY: str = os.getenv("MINIO_SECRET_KEY", "minio123")
    MINIO_SECURE: bool = os.getenv("MINIO_SECURE", "false").lower() == "true"

    # Nova arquitetura: três instâncias MinIO independentes, cada uma com um bucket.
    # O backend guarda uma parte do ficheiro cifrado em cada instância.
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
        # Mantém compatibilidade com código que ainda consulta settings.MINIO_BUCKETS.
        return [node["bucket"] for node in self.MINIO_NODES]

    # ----------------------------
    # Divisão de ficheiros
    # ----------------------------
    FILE_PARTS: int = 3


settings = Settings()
