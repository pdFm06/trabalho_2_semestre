from app.services.crypto_service import encrypt_file
from app.services.split_service import split_file
from app.storage.minio_client import upload_parts

async def upload_file(file):
    content = await file.read()

    encrypted = encrypt_file(content)
    parts = split_file(encrypted)
    locations = upload_parts(parts)

    return {
        "filename": file.filename,
        "stored_in": locations
    }