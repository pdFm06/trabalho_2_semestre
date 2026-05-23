from typing import Any

from pydantic import BaseModel, Field, field_validator
from datetime import datetime


class File_Create(BaseModel):
    # Define os dados internos necessários para criar um ficheiro na base de dados.
    filename: str
    owner_id: int
    folder_id: int | None = None
    parts: list[dict[str, Any]] | None = None
    encryption_mode: str | None = None
    file_iv: str | None = None
    file_size: int
    original_file_size: int | None = None
    file_hash: str | None = None


class FileResponse(BaseModel):
    # Define a estrutura devolvida pela API para um ficheiro.
    id: int
    filename: str
    owner_id: int
    folder_id: int | None = None
    parts: list[dict[str, Any]]
    encryption_mode: str | None
    file_iv: str | None
    file_size: int
    original_file_size: int | None
    file_hash: str | None
    is_favorite: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class FolderCreate(BaseModel):
    # Valida os dados recebidos para criar uma pasta.
    name: str = Field(min_length=1, max_length=120)
    parent_id: int | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        # Valida e normaliza o nome de uma pasta.
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("O nome da pasta não pode estar vazio.")
        if "/" in cleaned or "\\" in cleaned:
            raise ValueError("O nome da pasta não pode conter barras.")
        return cleaned


class FolderResponse(BaseModel):
    # Define a estrutura devolvida pela API para uma pasta.
    id: int
    name: str
    owner_id: int
    parent_id: int | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class FileMoveRequest(BaseModel):
    # Define o destino de uma operação de mover ficheiro.
    folder_id: int | None = None


class DriveResponse(BaseModel):
    # Define a resposta agregada da Drive com pasta atual, breadcrumbs, pastas e ficheiros.
    current_folder: FolderResponse | None = None
    breadcrumbs: list[FolderResponse]
    folders: list[FolderResponse]
    files: list[FileResponse]
