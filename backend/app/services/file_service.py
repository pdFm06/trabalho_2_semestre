import uuid
from app.services.split_service import split_file
from app.storage.minio_client import upload_part
from app.core.config import settings


async def upload_encrypted_file_parts(file, user_id: int) -> dict:
    """
    Serviço auxiliar/legacy para guardar um ficheiro que já vem cifrado.

    A cifra deve acontecer no frontend. Esta função apenas divide os bytes
    cifrados e guarda cada parte numa instância MinIO diferente.
    """
    content = await file.read()
    parts = split_file(content, parts=settings.FILE_PARTS)

    storage_id = str(uuid.uuid4())
    locations = []

    for index, part_data in enumerate(parts):
        locations.append(
            upload_part(
                node_index=index,
                user_id=user_id,
                storage_id=storage_id,
                part_number=index,
                data=part_data,
                original_filename=file.filename or "ficheiro-sem-nome",
            )
        )

    return {
        "filename": file.filename,
        "storage_id": storage_id,
        "stored_in": locations,
    }


# Compatibilidade com código antigo, se ainda existir alguma importação.
async def upload_file(file, user_id: int = 0) -> dict:
    return await upload_encrypted_file_parts(file=file, user_id=user_id)
