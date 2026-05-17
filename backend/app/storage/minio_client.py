import io
import time
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

def _ensure_bucket(bucket: str, attempts: int = 10, delay_seconds: float = 0.5):
    """
    Verifica se o bucket existe no MinIO.
    Se não existir, cria-o automaticamente.

    O retry evita que o primeiro upload falhe quando o container do MinIO
    já arrancou, mas ainda não está totalmente pronto para receber pedidos.
    """
    last_error = None

    for attempt in range(1, attempts + 1):
        try:
            if not _client.bucket_exists(bucket):
                _client.make_bucket(bucket)
            return
        except S3Error as exc:
            # Se outro pedido criou o bucket entre o bucket_exists e o make_bucket,
            # considerar a operação concluída.
            if exc.code in {"BucketAlreadyOwnedByYou", "BucketAlreadyExists"}:
                return
            last_error = exc
        except Exception as exc:
            last_error = exc

        if attempt < attempts:
            time.sleep(delay_seconds * attempt)

    raise RuntimeError(f"MinIO não ficou pronto para usar o bucket '{bucket}': {last_error}")

def upload_part(
    bucket: str,
    user_id: int,
    storage_id: str,
    part_number: int,
    data: bytes,
    original_filename: str,
) -> dict:
    """
    Faz upload de uma parte para o MinIO.
    """
    object_name = f"user_{user_id}/{storage_id}_part{part_number}"

    _ensure_bucket(bucket)

    _client.put_object(
        bucket_name=bucket,
        object_name=object_name,
        data=io.BytesIO(data),
        length=len(data),
        metadata={
            "owner_id": user_id,
            "storage_id": storage_id,
            "part_number": str(part_number),
            "original_filename": original_filename.encode("ascii", errors="replace").decode("ascii"),
        },
    )

    return {
        "bucket": bucket,
        "object_name": object_name,
        "part_number": part_number,
        "size": len(data),
    }


def delete_part(bucket: str, object_name: str) -> None:
    """
    Remove um objeto (parte de ficheiro) do MinIO.

    Esta operação é best-effort: se o objeto já não existir (NoSuchKey),
    considera-se que já foi eliminado e não lança erro.
    """
    try:
        _client.remove_object(bucket_name=bucket, object_name=object_name)
    except S3Error as exc:
        if exc.code == "NoSuchKey":
            return  # Já não existe — OK
        raise RuntimeError(
            f"Erro ao eliminar '{object_name}' do bucket '{bucket}': {exc}"
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