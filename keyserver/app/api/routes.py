from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db import crud
from app.schema.key_schema import FileKeyCreate, FileKeyResponse
from app.services.auth_service import get_current_user_id

router = APIRouter(tags=["keys"])


@router.post("/keys", response_model=FileKeyResponse, status_code=status.HTTP_201_CREATED)
def store_file_key(
    payload:  FileKeyCreate,
    db:       Session = Depends(get_db),
    owner_id: int     = Depends(get_current_user_id),
):
    # Guarda ou atualiza a chave cifrada de um ficheiro no keyserver.
    return crud.upsert_file_key(db, payload, owner_id)


@router.get("/keys/{file_id}", response_model=FileKeyResponse)
def get_file_key(
    file_id:  int,
    db:       Session = Depends(get_db),
    owner_id: int     = Depends(get_current_user_id),
):
    # Obtém a chave cifrada de um ficheiro pertencente ao utilizador autenticado.
    db_file_key = crud.get_file_key(db, file_id, owner_id)
    if not db_file_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chave do ficheiro não encontrada.",
        )
    return db_file_key


@router.delete("/keys/{file_id}")
def delete_file_key(
    file_id:  int,
    db:       Session = Depends(get_db),
    owner_id: int     = Depends(get_current_user_id),
):
    # Remove a chave cifrada associada a um ficheiro do utilizador autenticado.
    db_file_key = crud.delete_file_key(db, file_id, owner_id)
    if not db_file_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chave do ficheiro não encontrada.",
        )
    return {"message": "Chave cifrada do ficheiro eliminada com sucesso."}
