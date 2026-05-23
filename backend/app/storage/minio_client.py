import io
import time
from minio import Minio
from minio.error import S3Error
from app.core.config import settings


_nodes = settings.MINIO_NODES

_clients: dict[str, Minio] = {
    node["node_id"]: Minio(
        endpoint=node["endpoint"],
        access_key=node["access_key"],
        secret_key=node["secret_key"],
        secure=settings.MINIO_SECURE,
    )
    for node in _nodes
}

_node_by_id: dict[str, dict[str, str]] = {node["node_id"]: node for node in _nodes}


def _get_node_by_index(node_index: int) -> dict[str, str]:
    # Obtém a configuração MinIO correspondente ao índice da parte.
    try:
        return _nodes[node_index]
    except IndexError as exc:
        raise ValueError(f"Índice de nó MinIO inválido: {node_index}") from exc


def _get_node_by_id(node_id: str | None, part_number: int | None = None) -> dict[str, str]:
    # Obtém a configuração MinIO correspondente ao identificador do nó.
    if node_id:
        node = _node_by_id.get(node_id)
        if node:
            return node
        raise ValueError(f"Nó MinIO desconhecido: {node_id}")

    if part_number is not None:
        return _get_node_by_index(int(part_number))

    raise ValueError("Metadados da parte não indicam node_id nem part_number.")


def _ensure_bucket(node: dict[str, str], attempts: int = 12, delay_seconds: float = 0.5) -> None:
    # Garante que o bucket existe antes de gravar objetos no MinIO.
    bucket = node["bucket"]
    client = _clients[node["node_id"]]
    last_error = None

    for attempt in range(1, attempts + 1):
        try:
            if not client.bucket_exists(bucket):
                client.make_bucket(bucket)
            return
        except S3Error as exc:
            if exc.code in {"BucketAlreadyOwnedByYou", "BucketAlreadyExists"}:
                return
            last_error = exc
        except Exception as exc:
            last_error = exc

        if attempt < attempts:
            time.sleep(delay_seconds * attempt)

    raise RuntimeError(
        f"MinIO '{node['node_id']}' não ficou pronto para usar o bucket "
        f"'{bucket}': {last_error}"
    )


def upload_part(
    node_index: int,
    user_id: int,
    storage_id: str,
    part_number: int,
    data: bytes,
    original_filename: str,
) -> dict:
    # Guarda uma parte cifrada do ficheiro na instância MinIO correspondente.
    node = _get_node_by_index(node_index)
    bucket = node["bucket"]
    client = _clients[node["node_id"]]
    object_name = f"user_{user_id}/{storage_id}_part{part_number}"

    _ensure_bucket(node)

    client.put_object(
        bucket_name=bucket,
        object_name=object_name,
        data=io.BytesIO(data),
        length=len(data),
        metadata={
            "owner_id": str(user_id),
            "storage_id": storage_id,
            "part_number": str(part_number),
            "node_id": node["node_id"],
            "original_filename": original_filename.encode("ascii", errors="replace").decode("ascii"),
        },
    )

    return {
        "storage_backend": "minio",
        "node_id": node["node_id"],
        "bucket": bucket,
        "object_name": object_name,
        "part_number": part_number,
        "size": len(data),
    }


def delete_part(
    bucket: str,
    object_name: str,
    node_id: str | None = None,
    part_number: int | None = None,
) -> None:
    # Remove uma parte de ficheiro da instância MinIO onde está guardada.
    node = _get_node_by_id(node_id=node_id, part_number=part_number)
    client = _clients[node["node_id"]]
    bucket_name = bucket or node["bucket"]

    try:
        client.remove_object(bucket_name=bucket_name, object_name=object_name)
    except S3Error as exc:
        if exc.code == "NoSuchKey":
            return
        raise RuntimeError(
            f"Erro ao eliminar '{object_name}' do bucket '{bucket_name}' "
            f"em '{node['node_id']}': {exc}"
        )


def download_part(
    bucket: str,
    object_name: str,
    node_id: str | None = None,
    part_number: int | None = None,
) -> bytes:
    # Obtém uma parte de ficheiro a partir da instância MinIO correta.
    node = _get_node_by_id(node_id=node_id, part_number=part_number)
    client = _clients[node["node_id"]]
    bucket_name = bucket or node["bucket"]

    response = None
    try:
        response = client.get_object(
            bucket_name=bucket_name,
            object_name=object_name,
        )
        return response.read()
    except S3Error as exc:
        raise RuntimeError(
            f"Erro ao descarregar '{object_name}' do bucket '{bucket_name}' "
            f"em '{node['node_id']}': {exc}"
        )
    finally:
        if response:
            response.close()
            response.release_conn()
