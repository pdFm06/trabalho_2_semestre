from pydantic import BaseModel, Field


class FileKeyCreate(BaseModel):
    file_id:            int
    encrypted_file_key: str = Field(min_length=32)
    key_algorithm:      str = "RSA-OAEP-4096-SHA-256"
    file_key_algorithm: str = "AES-256-GCM"


class FileKeyResponse(BaseModel):
    file_id:            int
    owner_id:           int
    encrypted_file_key: str
    key_algorithm:      str
    file_key_algorithm: str

    model_config = {"from_attributes": True}