import uuid
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import UploadedFile
from app.schema.file_schema import FileUploadResponse, FileListItem
from app.services.split_service import split_file, reassemble_file
from app.storage.minio_client import upload_part, download_part
from app.core.config import settings

# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------
# APIRouter é como um "mini-app" FastAPI.
# Definimos as rotas aqui e registamos no main.py com app.include_router().
router = APIRouter()


# ---------------------------------------------------------------------------
# POST /files/upload
# ---------------------------------------------------------------------------
@router.post("/upload", response_model=FileUploadResponse)
async def upload_file(
    file: UploadFile = File(...),       # ficheiro recebido no form-data
    db: Session = Depends(get_db)       # sessão de base de dados injetada automaticamente
):
    """
    Recebe um ficheiro, divide-o em partes e guarda cada parte
    num bucket MinIO diferente. Os metadados ficam no PostgreSQL.
    """

    # 1. Ler todos os bytes do ficheiro enviado
    data = await file.read()

    # 2. Gerar um ID único para este ficheiro (evita colisões de nomes)
    file_id = str(uuid.uuid4())

    # 3. Dividir o ficheiro em N partes (definido em config.py)
    parts = split_file(data, parts=settings.FILE_PARTS)

    # 4. Guardar cada parte no bucket MinIO correspondente
    bucket_names = []
    for i, part_data in enumerate(parts):
        bucket = settings.MINIO_BUCKETS[i]
        # O objeto no MinIO será nomeado com o file_id para fácil recuperação
        object_name = f"{file_id}_part{i}"
        upload_part(bucket=bucket, object_name=object_name, data=part_data)
        bucket_names.append(bucket)

    # 5. Guardar os metadados na base de dados PostgreSQL
    db_file = UploadedFile(
        original_filename=file.filename,
        file_id=file_id,
        num_parts=len(parts),
        bucket_names=",".join(bucket_names),   # "bucket-part-0,bucket-part-1,bucket-part-2"
        file_size=len(data),
    )
    db.add(db_file)     # adiciona à sessão (ainda não grava)
    db.commit()         # grava na base de dados
    db.refresh(db_file) # atualiza o objeto com os dados gerados pela BD (ex: id)

    return FileUploadResponse(
        message="Ficheiro carregado com sucesso.",
        file_id=file_id,
        original_filename=file.filename,
        num_parts=len(parts),
        buckets=bucket_names,
    )


# ---------------------------------------------------------------------------
# GET /files/
# ---------------------------------------------------------------------------
@router.get("/", response_model=list[FileListItem])
def list_files(db: Session = Depends(get_db)):
    """
    Devolve a lista de todos os ficheiros armazenados.
    """
    files = db.query(UploadedFile).all()
    return files


# ---------------------------------------------------------------------------
# GET /files/{file_id}/download
# ---------------------------------------------------------------------------
@router.get("/{file_id}/download")
def download_file(file_id: str, db: Session = Depends(get_db)):
    """
    Reconstrói o ficheiro original a partir das partes no MinIO
    e envia-o como resposta binária para o cliente.
    """

    # 1. Procurar os metadados na base de dados
    db_file = db.query(UploadedFile).filter(UploadedFile.file_id == file_id).first()

    if not db_file:
        # 404 se o file_id não existir
        raise HTTPException(status_code=404, detail="Ficheiro não encontrado.")

    # 2. Recuperar cada parte do MinIO
    buckets = db_file.bucket_names.split(",")
    parts = []
    for i, bucket in enumerate(buckets):
        object_name = f"{file_id}_part{i}"
        part_data = download_part(bucket=bucket, object_name=object_name)
        parts.append(part_data)

    # 3. Reconstruir o ficheiro original
    original_data = reassemble_file(parts)

    # 4. Enviar como download binário
    # filename* usa codificação UTF-8 (RFC 5987) para suportar caracteres especiais
    # como ã, ç, é, etc. que não são permitidos diretamente em headers HTTP (latin-1)
    from urllib.parse import quote
    filename_encoded = quote(db_file.original_filename, safe="")
    return Response(
        content=original_data,
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{filename_encoded}"
        }
    )


# ---------------------------------------------------------------------------
# DELETE /files/{file_id}
# ---------------------------------------------------------------------------
@router.delete("/{file_id}")
def delete_file(file_id: str, db: Session = Depends(get_db)):
    """
    Remove os metadados da base de dados.
    (Opcional: podes também apagar os objetos do MinIO aqui.)
    """
    db_file = db.query(UploadedFile).filter(UploadedFile.file_id == file_id).first()

    if not db_file:
        raise HTTPException(status_code=404, detail="Ficheiro não encontrado.")

    db.delete(db_file)
    db.commit()

    return {"message": f"Ficheiro '{db_file.original_filename}' eliminado com sucesso."}