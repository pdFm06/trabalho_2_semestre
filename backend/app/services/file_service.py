import uuid
# O ficheiro chama-se cripto_service.py (com 'i') — import corrigido
from app.services.cripto_service import generate_key, encrypt_file
from app.services.split_service import split_file
from app.storage.minio_client import upload_part
from app.core.config import settings


async def upload_file(file) -> dict:
    content = await file.read()

    # Gera uma chave AES-256 aleatória para este ficheiro
    key = generate_key()

    # Cifra o ficheiro com AES-256-GCM
    encrypted = encrypt_file(content, key)

    # Divide o ficheiro cifrado em 3 partes
    parts = split_file(encrypted, parts=settings.FILE_PARTS)

    # Guarda cada parte num bucket MinIO diferente
    file_id = str(uuid.uuid4())
    locations = []
    for i, part_data in enumerate(parts):
        bucket = settings.MINIO_BUCKETS[i]
        object_name = f"{file_id}_part{i}"
        upload_part(bucket=bucket, object_name=object_name, data=part_data)
        locations.append({"bucket": bucket, "object_name": object_name})

    return {
        "filename": file.filename,
        "file_id": file_id,
        "encrypted_key": key.hex(),
        "stored_in": locations
    }