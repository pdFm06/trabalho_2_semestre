import io
from minio import Minio
from minio.error import S3Error
from app.core.config import settings

# ---------------------------------------------------------------------------
# Cliente MinIO
# ---------------------------------------------------------------------------
# Criamos UMA instância global do cliente MinIO.
# Ela é reutilizada em todas as chamadas (não abre ligação nova a cada pedido).
_client = Minio(
    endpoint=settings.MINIO_ENDPOINT,
    access_key=settings.MINIO_ACCESS_KEY,
    secret_key=settings.MINIO_SECRET_KEY,
    secure=settings.MINIO_SECURE,
)

def _ensure_bucket(bucket: str):
    """
    Verifica se o bucket existe no MinIO.
    Se não existir, cria-o automaticamente.
    Chamada internamente antes de qualquer upload.
    """
    if not _client.bucket_exists(bucket):
        _client.make_bucket(bucket)


def upload_part(bucket: str, object_name: str, data: bytes) -> None:
    """
    Faz upload de uma parte (bytes) para o MinIO.

    - bucket: nome do bucket de destino (ex: "bucket-part-0")
    - object_name: nome do objeto dentro do bucket (ex: "uuid_part0")
    - data: os bytes a guardar

    io.BytesIO converte os bytes numa "stream" que o MinIO consegue ler.
    len(data) é obrigatório para o MinIO saber o tamanho antecipadamente.
    """
    _ensure_bucket(bucket)
    _client.put_object(
        bucket_name=bucket,
        object_name=object_name,
        data=io.BytesIO(data),
        length=len(data),
    )


def download_part(bucket: str, object_name: str) -> bytes:
    """
    Descarrega uma parte do MinIO e devolve os bytes.

    response.read() lê todo o conteúdo do objeto.
    O bloco finally garante que a ligação HTTP é sempre fechada,
    mesmo que ocorra um erro durante a leitura.
    """
    response = None
    try:
        response = _client.get_object(
            bucket_name=bucket,
            object_name=object_name,
        )
        return response.read()
    except S3Error as e:
        raise RuntimeError(f"Erro ao descarregar '{object_name}' do bucket '{bucket}': {e}")
    finally:
        if response:
            response.close()
            response.release_conn()