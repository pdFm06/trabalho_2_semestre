import hashlib
from fastapi import APIRouter, UploadFile, File as FastAPIFile, Depends, HTTPException, status, Form, Header
from sqlalchemy.orm import Session
from urllib import request, error
import io
from fastapi.responses import StreamingResponse
from app.core.config import settings

from app.db.database import get_db
from app.db import crud
from app.db.models import User
from app.schema.file_schema import FileResponse, File_Create
from app.services.auth_service import get_current_user
from app.services.split_service import split_file
from app.storage.minio_client import upload_part, download_part
import uuid
router = APIRouter(tags=["files"])


@router.post("/upload", response_model=FileResponse)
async def upload_file(
    file: UploadFile = FastAPIFile(...),
    file_iv: str = Form(...),
    original_file_size: int = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Recebe um ficheiro já cifrado pelo frontend.

    Nesta fase ainda não guardamos as partes no MinIO. O objetivo é fechar o fluxo:
    frontend cifra ficheiro -> backend guarda metadados do ficheiro cifrado ->
    frontend guarda a chave AES cifrada no keyserver.
    """
    data = await file.read()

    if not data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="O ficheiro está vazio.",
        )

    if original_file_size < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tamanho original inválido.",
        )

    file_hash = hashlib.sha256(data).hexdigest()

    file_storage_id = str(uuid.uuid4())
    chunks = split_file(data, parts=settings.FILE_PARTS)

    stored_parts = []   

    for index, chunk in enumerate(chunks):
        bucket = settings.MINIO_BUCKETS[index]

        part_info = upload_part(
            bucket=bucket,
            user_id=current_user.id,
            storage_id=file_storage_id,
            part_number=index,
            data=chunk,
            original_filename=file.filename or "ficheiro-sem-nome",
            )

        stored_parts.append(part_info)


    file_data = File_Create(
        filename=file.filename or "ficheiro-sem-nome",
        owner_id=current_user.id,
        parts=stored_parts, 
        encryption_mode="client-side-aes-256-gcm",
        file_iv=file_iv,
        file_size=len(data),
        original_file_size=original_file_size,
        file_hash=file_hash,
    )

    return crud.create_file(db=db, file_data=file_data)

@router.get("/download/{file_id}")
def download_file(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db_file = crud.get_file_by_id_and_owner(db, file_id=file_id, owner_id=current_user.id)

    if not db_file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ficheiro não encontrado.",
        )

    def file_stream_generator():
        for part in db_file.parts:
            bucket = part["bucket"]
            object_name = part["object_name"]
            yield download_part(bucket, object_name)

    return StreamingResponse(
        file_stream_generator(),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{db_file.filename}"'},
    )


@router.get("/files", response_model=list[FileResponse])
def get_my_files(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return crud.get_files_by_owner(db=db, owner_id=current_user.id)


def _delete_file_key_from_keyserver(file_id: int, authorization_header: str | None) -> bool:
    """Apaga a chave cifrada do ficheiro no keyserver.

    Esta chamada é best-effort: se o keyserver estiver indisponível, o backend não
    deixa de apagar o registo do ficheiro. O frontend recebe a indicação para ser
    claro que pode ter ficado uma chave órfã no keyserver.
    """
    if not authorization_header:
        return False

    url = f"{settings.KEYSERVER_INTERNAL_URL.rstrip('/')}/keys/{file_id}"
    req = request.Request(
        url=url,
        method="DELETE",
        headers={"Authorization": authorization_header},
    )

    try:
        with request.urlopen(req, timeout=3) as response:
            return 200 <= response.status < 300
    except error.HTTPError as exc:
        # 404 significa que a chave já não existe; para o delete isto é aceitável.
        return exc.code == status.HTTP_404_NOT_FOUND
    except Exception:
        return False


@router.delete("/delete")
def delete_file(
    file_id: int,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db_file = crud.delete_file(db, file_id=file_id, owner_id=current_user.id)

    if not db_file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ficheiro não encontrado.",
        )

    key_deleted = _delete_file_key_from_keyserver(file_id, authorization)

    return {
        "message": f"Ficheiro '{db_file.filename}' eliminado com sucesso.",
        "keyserver_key_deleted": key_deleted,
    }
