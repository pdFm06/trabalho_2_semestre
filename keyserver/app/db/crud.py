from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.db.models import FileKey
from app.schema.key_schema import FileKeyCreate


def get_file_key(db: Session, file_id: int, owner_id: int) -> FileKey | None:
    return (
        db.query(FileKey)
        .filter(FileKey.file_id == file_id, FileKey.owner_id == owner_id)
        .first()
    )


def upsert_file_key(db: Session, payload: FileKeyCreate, owner_id: int) -> FileKey:
    existing = get_file_key(db, payload.file_id, owner_id)

    if existing:
        existing.encrypted_file_key = payload.encrypted_file_key
        existing.key_algorithm      = payload.key_algorithm
        existing.file_key_algorithm = payload.file_key_algorithm
        existing.updated_at         = datetime.now(timezone.utc)
        db.add(existing)
        db.commit()
        db.refresh(existing)
        return existing

    db_file_key = FileKey(
        file_id            = payload.file_id,
        owner_id           = owner_id,
        encrypted_file_key = payload.encrypted_file_key,
        key_algorithm      = payload.key_algorithm,
        file_key_algorithm = payload.file_key_algorithm,
    )
    db.add(db_file_key)
    db.commit()
    db.refresh(db_file_key)
    return db_file_key


def delete_file_key(db: Session, file_id: int, owner_id: int) -> FileKey | None:
    db_file_key = get_file_key(db, file_id, owner_id)
    if not db_file_key:
        return None
    db.delete(db_file_key)
    db.commit()
    return db_file_key
