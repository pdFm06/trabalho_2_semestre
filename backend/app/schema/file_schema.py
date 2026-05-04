from pydantic import BaseModel
from datetime import datetime

# ---------------------------------------------------------------------------
# O Pydantic valida e serializa os dados que entram e saem da API.
# Cada classe define a "forma" esperada dos dados JSON.
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Schema de resposta ao upload
# ---------------------------------------------------------------------------
# Retornado quando um ficheiro é carregado com sucesso.
class FileUploadResponse(BaseModel):
    message: str               # Ex: "Ficheiro carregado com sucesso"
    file_id: str               # UUID único do ficheiro
    original_filename: str     # Nome original (ex: "documento.pdf")
    num_parts: int             # Número de partes em que foi dividido
    buckets: list[str]         # Lista de buckets onde as partes foram guardadas


# ---------------------------------------------------------------------------
# Schema de item na listagem de ficheiros
# ---------------------------------------------------------------------------
# Usado quando o utilizador pede a lista de todos os seus ficheiros.
class FileListItem(BaseModel):
    id: int
    file_id: str
    original_filename: str
    file_size: int
    num_parts: int
    uploaded_at: datetime

    # model_config com from_attributes=True permite criar este schema
    # diretamente a partir de um objeto SQLAlchemy (ORM model).
    # Sem isto, o Pydantic não consegue ler atributos de objetos Python.
    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Schema de resposta ao download
# ---------------------------------------------------------------------------
# Metadados retornados antes de enviar o ficheiro reconstruído.
class FileDownloadInfo(BaseModel):
    file_id: str
    original_filename: str
    file_size: int