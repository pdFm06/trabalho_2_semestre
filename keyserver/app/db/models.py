from sqlalchemy import Column, DateTime, Integer, String, Text, UniqueConstraint, func

from app.db.database import Base


class FileKey(Base):
    # Representa a chave AES cifrada de um ficheiro guardada no keyserver.
    __tablename__ = "file_keys"
    __table_args__ = (
        UniqueConstraint("file_id", "owner_id", name="uq_file_key_file_owner"),
    )

    id                 = Column(Integer,  primary_key=True, index=True)
    file_id            = Column(Integer,  nullable=False, index=True)
    owner_id           = Column(Integer,  nullable=False, index=True)
    encrypted_file_key = Column(Text,     nullable=False)
    key_algorithm      = Column(String(80), nullable=False, default="RSA-OAEP-4096-SHA-256")
    file_key_algorithm = Column(String(40), nullable=False, default="AES-256-GCM")
    created_at         = Column(DateTime(timezone=True), server_default=func.now())
    updated_at         = Column(DateTime(timezone=True), nullable=True)
