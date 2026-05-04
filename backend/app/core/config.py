import os

class Settings:
    """
    Centraliza todas as configurações da aplicação.
    Os valores são lidos das variáveis de ambiente definidas no compose.yaml.
    Se a variável não existir, usa o valor padrão (segundo argumento do os.getenv).
    """

    APP_NAME: str = "Secure Cloud Storage"

    # ----------------------------
    # Base de Dados (PostgreSQL)
    # ----------------------------
    # Lê a DATABASE_URL do ambiente. Em Docker, será algo como:
    # postgresql://user:password@db:5432/user_info
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql://user:password@localhost:5433/user_info"  # fallback para dev local
    )

    # ----------------------------
    # MinIO (armazenamento de objetos)
    # ----------------------------
    MINIO_ENDPOINT: str = os.getenv("MINIO_ENDPOINT", "localhost:9000")
    MINIO_ACCESS_KEY: str = os.getenv("MINIO_ACCESS_KEY", "minio")
    MINIO_SECRET_KEY: str = os.getenv("MINIO_SECRET_KEY", "minio123")
    MINIO_SECURE: bool = False  # True se usar HTTPS

    # Nome dos buckets onde as partes dos ficheiros serão guardadas.
    # Cada parte vai para um bucket diferente (distribuição).
    MINIO_BUCKETS: list[str] = ["bucket-part-0", "bucket-part-1", "bucket-part-2"]

    # ----------------------------
    # Divisão de ficheiros
    # ----------------------------
    # Número de partes em que cada ficheiro será dividido
    FILE_PARTS: int = 3


# Instância global usada no resto da aplicação:
# from app.core.config import settings
settings = Settings()