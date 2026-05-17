import os
from datetime import datetime, timezone
import time

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel, Field
from sqlalchemy import Column, DateTime, Integer, String, Text, UniqueConstraint, create_engine, func
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session, declarative_base, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://keyuser:keypassword@localhost:5434/keydb")
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-only-change-this-secret-key-before-production")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()
security = HTTPBearer(auto_error=False)


class FileKey(Base):
    __tablename__ = "file_keys"
    __table_args__ = (
        UniqueConstraint("file_id", "owner_id", name="uq_file_key_file_owner"),
    )

    id = Column(Integer, primary_key=True, index=True)
    file_id = Column(Integer, nullable=False, index=True)
    owner_id = Column(Integer, nullable=False, index=True)
    encrypted_file_key = Column(Text, nullable=False)
    key_algorithm = Column(String(80), nullable=False, default="RSA-OAEP-4096-SHA-256")
    file_key_algorithm = Column(String(40), nullable=False, default="AES-256-GCM")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=True)


class FileKeyCreate(BaseModel):
    file_id: int
    encrypted_file_key: str = Field(min_length=32)
    key_algorithm: str = "RSA-OAEP-4096-SHA-256"
    file_key_algorithm: str = "AES-256-GCM"


class FileKeyResponse(BaseModel):
    file_id: int
    owner_id: int
    encrypted_file_key: str
    key_algorithm: str
    file_key_algorithm: str

    model_config = {"from_attributes": True}


app = FastAPI(title="Cloud Keyserver", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def init_db_with_retry(max_attempts: int = 30, delay_seconds: int = 2):
    """Inicializa as tabelas do keyserver quando o Postgres já estiver disponível."""
    last_error = None

    for attempt in range(1, max_attempts + 1):
        try:
            Base.metadata.create_all(bind=engine)
            print("Keyserver database ready.")
            return
        except OperationalError as exc:
            last_error = exc
            print(
                f"Keyserver database not ready "
                f"({attempt}/{max_attempts}). Retrying in {delay_seconds}s..."
            )
            time.sleep(delay_seconds)

    raise last_error


@app.on_event("startup")
def on_startup():
    init_db_with_retry()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user_id(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> int:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Autenticação necessária.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = jwt.decode(
            credentials.credentials,
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM],
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido ou expirado.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if payload.get("type") != "access" or not payload.get("sub"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        return int(payload["sub"])
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido.",
            headers={"WWW-Authenticate": "Bearer"},
        )


@app.get("/")
def root():
    return {"message": "Key server running"}


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post("/keys", response_model=FileKeyResponse, status_code=status.HTTP_201_CREATED)
def store_file_key(
    payload: FileKeyCreate,
    db: Session = Depends(get_db),
    owner_id: int = Depends(get_current_user_id),
):
    existing = (
        db.query(FileKey)
        .filter(FileKey.file_id == payload.file_id, FileKey.owner_id == owner_id)
        .first()
    )

    if existing is not None:
        existing.encrypted_file_key = payload.encrypted_file_key
        existing.key_algorithm = payload.key_algorithm
        existing.file_key_algorithm = payload.file_key_algorithm
        existing.updated_at = datetime.now(timezone.utc)
        db.add(existing)
        db.commit()
        db.refresh(existing)
        return existing

    db_file_key = FileKey(
        file_id=payload.file_id,
        owner_id=owner_id,
        encrypted_file_key=payload.encrypted_file_key,
        key_algorithm=payload.key_algorithm,
        file_key_algorithm=payload.file_key_algorithm,
    )
    db.add(db_file_key)
    db.commit()
    db.refresh(db_file_key)
    return db_file_key


@app.get("/keys/{file_id}", response_model=FileKeyResponse)
def get_file_key(
    file_id: int,
    db: Session = Depends(get_db),
    owner_id: int = Depends(get_current_user_id),
):
    db_file_key = (
        db.query(FileKey)
        .filter(FileKey.file_id == file_id, FileKey.owner_id == owner_id)
        .first()
    )

    if db_file_key is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chave do ficheiro não encontrada.",
        )

    return db_file_key


@app.delete("/keys/{file_id}")
def delete_file_key(
    file_id: int,
    db: Session = Depends(get_db),
    owner_id: int = Depends(get_current_user_id),
):
    db_file_key = (
        db.query(FileKey)
        .filter(FileKey.file_id == file_id, FileKey.owner_id == owner_id)
        .first()
    )

    if db_file_key is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chave do ficheiro não encontrada.",
        )

    db.delete(db_file_key)
    db.commit()
    return {"message": "Chave cifrada do ficheiro eliminada com sucesso."}
