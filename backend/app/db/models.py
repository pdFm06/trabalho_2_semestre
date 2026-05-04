from sqlalchemy import Column, Integer, String, DateTime, func
from app.db.database import Base

# ---------------------------------------------------------------------------
# Model: UploadedFile
# ---------------------------------------------------------------------------
# Representa um ficheiro que foi carregado pelo utilizador.
# Cada linha nesta tabela = um ficheiro armazenado no sistema.
#
# O SQLAlchemy mapeia automaticamente esta classe para a tabela "uploaded_files".

class UploadedFile(Base):
    __tablename__ = "uploaded_files"

    # Chave primária auto-incremental
    id = Column(Integer, primary_key=True, index=True)

    # Nome original do ficheiro (ex: "relatorio.pdf")
    original_filename = Column(String, nullable=False)

    # Identificador único gerado no momento do upload (UUID).
    # Usado para nomear as partes no MinIO de forma segura e sem colisões.
    # Ex: "a3f2c1d4-5e6b-7890-abcd-ef1234567890"
    file_id = Column(String, unique=True, nullable=False, index=True)

    # Número de partes em que o ficheiro foi dividido (normalmente 3)
    num_parts = Column(Integer, nullable=False, default=3)

    # Nomes dos buckets MinIO onde cada parte foi guardada,
    # separados por vírgula. Ex: "bucket-part-0,bucket-part-1,bucket-part-2"
    # Alternativa mais avançada seria usar uma tabela separada FilePart.
    bucket_names = Column(String, nullable=False)

    # Tamanho original do ficheiro em bytes
    file_size = Column(Integer, nullable=False)

    # Data e hora do upload, preenchida automaticamente pela base de dados
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())