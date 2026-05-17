from typing import Any

from pydantic import BaseModel
from datetime import datetime


class File_Create(BaseModel):
    filename: str
    owner_id: int
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
    parts: list[dict[str, Any]]
    encryption_mode: str | None
    file_iv: str | None
    file_size: int
    original_file_size: int | None
    file_hash: str | None
    is_favorite: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class FileListItem(BaseModel):
    id: int
    filename: str
    file_size: int
    num_parts: int
    created_at: datetime

    model_config = {"from_attributes": True}


class FileDownloadInfo(BaseModel):
    file_id: str
    original_filename: str
    file_size: int