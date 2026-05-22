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
from app.schema.file_schema import FileResponse, File_Create, FolderCreate, FolderResponse, DriveResponse, FileMoveRequest
from app.services.auth_service import get_current_user
from app.services.split_service import split_file
from app.storage.minio_client import upload_part, download_part, delete_part
import uuid
router = APIRouter(tags=["files"])


@router.post("/upload", response_model=FileResponse)
async def upload_file(
    file: UploadFile = FastAPIFile(...),
    file_iv: str = Form(...),
    original_file_size: int = Form(...),
    folder_id: int | None = Form(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
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

    if (current_user.storage_used or 0) + len(data) > (current_user.storage_quota or 1_073_741_824):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Espaço de armazenamento insuficiente. Elimina ficheiros para libertar espaço.",
        )

    if folder_id is not None and not crud.get_folder_by_id_and_owner(db, folder_id, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pasta de destino não encontrada.",
        )

    file_hash = hashlib.sha256(data).hexdigest()

    file_storage_id = str(uuid.uuid4())
    chunks = split_file(data, parts=settings.FILE_PARTS)

    stored_parts = []

    for index, chunk in enumerate(chunks):
        part_info = upload_part(
            node_index=index,
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
        folder_id=folder_id,
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
            bucket = part.get("bucket")
            object_name = part.get("object_name")
            node_id = part.get("node_id")
            part_number = part.get("part_number")
            yield download_part(
                bucket=bucket,
                object_name=object_name,
                node_id=node_id,
                part_number=part_number,
            )

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


@router.get("/drive", response_model=DriveResponse)
def get_drive_folder(
    folder_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_folder = None
    if folder_id is not None:
        current_folder = crud.get_folder_by_id_and_owner(db, folder_id, current_user.id)
        if not current_folder:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Pasta não encontrada.",
            )

    return {
        "current_folder": current_folder,
        "breadcrumbs": crud.get_folder_breadcrumbs(db, current_folder, current_user.id),
        "folders": crud.get_folders_by_owner_and_parent(db, current_user.id, folder_id),
        "files": crud.get_files_by_owner_and_folder(db, current_user.id, folder_id),
    }


@router.get("/folders", response_model=list[FolderResponse])
def list_folders(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return crud.get_folders_by_owner(db, current_user.id)


@router.post("/folders", response_model=FolderResponse, status_code=status.HTTP_201_CREATED)
def create_folder(
    folder_data: FolderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if folder_data.parent_id is not None and not crud.get_folder_by_id_and_owner(db, folder_data.parent_id, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pasta pai não encontrada.",
        )

    try:
        return crud.create_folder(
            db=db,
            owner_id=current_user.id,
            name=folder_data.name,
            parent_id=folder_data.parent_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.delete("/folders/{folder_id}")
def delete_folder(
    folder_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    folder = crud.get_folder_by_id_and_owner(db, folder_id, current_user.id)
    if not folder:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pasta não encontrada.",
        )

    if crud.folder_has_children(db, current_user.id, folder_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A pasta não está vazia. Apague ou mova primeiro os ficheiros e subpastas.",
        )

    deleted = crud.delete_folder(db, current_user.id, folder_id)
    return {"message": f"Pasta '{deleted.name}' eliminada com sucesso."}


@router.patch("/files/{file_id}/move", response_model=FileResponse)
def move_file(
    file_id: int,
    move_data: FileMoveRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        db_file = crud.move_file_to_folder(
            db=db,
            file_id=file_id,
            owner_id=current_user.id,
            folder_id=move_data.folder_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    if not db_file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ficheiro não encontrado.",
        )

    return db_file


@router.patch("/files/{file_id}/favorite", response_model=FileResponse)
def toggle_favorite(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db_file = crud.toggle_favorite(db, file_id=file_id, owner_id=current_user.id)
    if not db_file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ficheiro não encontrado.",
        )
    return db_file


def _delete_file_key_from_keyserver(file_id: int, authorization_header: str | None) -> bool:
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
    db_file = crud.get_file_by_id_and_owner(db, file_id=file_id, owner_id=current_user.id)

    if not db_file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ficheiro não encontrado.",
        )

    parts_to_delete = list(db_file.parts or [])
    filename = db_file.filename

    crud.delete_file(db, file_id=file_id, owner_id=current_user.id)

    minio_errors = []
    for part in parts_to_delete:
        bucket = part.get("bucket")
        object_name = part.get("object_name")
        if bucket and object_name:
            try:
                delete_part(
                    bucket=bucket,
                    object_name=object_name,
                    node_id=part.get("node_id"),
                    part_number=part.get("part_number"),
                )
            except Exception as exc:
                minio_errors.append(f"{bucket}/{object_name}: {exc}")

    key_deleted = _delete_file_key_from_keyserver(file_id, authorization)

    return {
        "message": f"Ficheiro '{filename}' eliminado com sucesso.",
        "keyserver_key_deleted": key_deleted,
        "minio_parts_deleted": len(parts_to_delete) - len(minio_errors),
        "minio_errors": minio_errors if minio_errors else None,
    }
