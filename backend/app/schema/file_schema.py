from typing import Any

from pydantic import BaseModel, Field, field_validator
from datetime import datetime


class File_Create(BaseModel):
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
    name: str = Field(min_length=1, max_length=120)
    parent_id: int | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("O nome da pasta não pode estar vazio.")
        if "/" in cleaned or "\\" in cleaned:
            raise ValueError("O nome da pasta não pode conter barras.")
        return cleaned


class FolderResponse(BaseModel):
    id: int
    name: str
    owner_id: int
    parent_id: int | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class FileMoveRequest(BaseModel):
    folder_id: int | None = None


class DriveResponse(BaseModel):
    current_folder: FolderResponse | None = None
    breadcrumbs: list[FolderResponse]
    folders: list[FolderResponse]
    files: list[FileResponse]
