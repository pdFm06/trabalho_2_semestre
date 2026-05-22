from sqlalchemy import Column, Integer, String, DateTime, func, Boolean, ForeignKey
from app.db.database import Base
from sqlalchemy.dialects.postgresql import JSONB


class Folder(Base):
    __tablename__ = "folders"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    owner_id = Column(Integer, nullable=False, index=True)

    parent_id = Column(Integer, ForeignKey("folders.id", ondelete="CASCADE"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class File(Base):
    __tablename__ = "files"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, nullable=False)

    owner_id = Column(Integer, nullable=False, index=True)

    folder_id = Column(Integer, ForeignKey("folders.id", ondelete="SET NULL"), nullable=True, index=True)

    parts = Column(JSONB, nullable=False, default=list)

    encryption_mode = Column(String(40), nullable=True)
    file_iv = Column(String, nullable=True)

    file_size = Column(Integer, nullable=False)  # Tamanho do ficheiro cifrado recebido pelo backend.
    original_file_size = Column(Integer, nullable=True)
    file_hash = Column(String, nullable=True)  # Hash SHA-256 do ficheiro cifrado.

    is_favorite = Column(Boolean, nullable=False, default=False, server_default="false")

    created_at = Column(DateTime(timezone=True), server_default=func.now())


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=False), server_default=func.now())

    kdf_salt = Column(String, nullable=False)
    kdf_iterations = Column(Integer, nullable=False, default=600000)
    kdf_hash = Column(String, nullable=False, default="SHA-256")

    public_key = Column(String, nullable=False)

    encrypted_private_key = Column(String, nullable=False)
    private_key_iv = Column(String, nullable=False)

    encrypted_private_key_recovery = Column(String, nullable=False)
    recovery_key_iv = Column(String, nullable=False)

    key_algorithm = Column(String, nullable=False, default="RSA-OAEP-4096-SHA-256")
    password_reset_code_hash = Column(String, nullable=True)
    password_reset_expires_at = Column(DateTime(timezone=True), nullable=True)


    mfa_enabled = Column(Boolean, nullable=False, default=False, server_default="false")

    mfa_code_hash = Column(String, nullable=True)
    mfa_code_expires_at = Column(DateTime(timezone=True), nullable=True)
    mfa_challenge_id = Column(String, nullable=True, index=True)
    mfa_code_purpose = Column(String(40), nullable=True)

    recovery_key_hash = Column(String, nullable=True)

    storage_quota = Column(Integer, nullable=False, default=1_073_741_824, server_default="1073741824")
    storage_used  = Column(Integer, nullable=False, default=0,             server_default="0")
