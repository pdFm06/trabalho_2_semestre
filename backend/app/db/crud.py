from app.schema.file_schema import File_Create
from sqlalchemy.orm import Session
from app.db.models import User, File
from app.schema.user_schema import UserCreate
from app.services.auth_service import hash_password


# ---------------------------------------------------------------------------
# CRUD = Create, Read, Update, Delete
# ---------------------------------------------------------------------------
# Este ficheiro centraliza todas as operações com a base de dados.
# As rotas (routes_files.py) chamam estas funções em vez de fazer
# queries diretamente — isto torna o código mais organizado e reutilizável.
# ---------------------------------------------------------------------------


def get_files_by_owner(db: Session, owner_id: int) -> list[File]:
    return db.query(File).filter(File.owner_id == owner_id).all()

def get_file_by_id_and_owner(db: Session, file_id: int, owner_id: int) -> File | None:
    return db.query(File).filter(File.id == file_id, File.owner_id == owner_id).first()

def delete_file(db: Session, file_id: int, owner_id: int) -> File | None:
    """
    DELETE — Remove um ficheiro da base de dados pelo seu file_id.
    Devolve o objeto eliminado ou None se não existir.
    """
    db_file = get_file_by_id_and_owner(db, file_id, owner_id)
    if not db_file:
        return None
    db.delete(db_file)
    db.commit()
    return db_file

def get_user_by_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(User.email == email).first()

def get_user_by_id(db: Session, user_id: int) -> User | None:
    return db.query(User).filter(User.id == user_id).first()

def create_user(db: Session, user_create: UserCreate):
    hashed_password = hash_password(user_create.password)

    db_user = User(
        email=user_create.email,
        password_hash=hashed_password,

        public_key=user_create.public_key,
        encrypted_private_key=user_create.encrypted_private_key,
        private_key_iv=user_create.private_key_iv,

        kdf_salt=user_create.kdf_salt,
        kdf_iterations=user_create.kdf_iterations,
        kdf_hash=getattr(user_create, "kdf_hash", "SHA-256"),
        key_algorithm=getattr(user_create, "key_algorithm", "RSA-OAEP-4096"),

        encrypted_private_key_recovery=user_create.encrypted_private_key_recovery,
        recovery_key_iv=user_create.recovery_key_iv,
    )

    db.add(db_user)
    db.commit()
    db.refresh(db_user)

    return db_user

def set_password_reset_code(db: Session, user: User, code_hash: str, expires_at) -> User:
    """
    Guarda na BD o hash do código temporário de redefinição de password.

    Nota:
    - O código em claro nunca é guardado.
    - Em desenvolvimento, o código pode ser devolvido pela API para facilitar testes,
      mas na BD fica apenas o hash.
    """
    user.password_reset_code_hash = code_hash
    user.password_reset_expires_at = expires_at

    db.add(user)
    db.commit()
    db.refresh(user)

    return user


def is_password_reset_code_expired(user: User) -> bool:
    """
    Verifica se o código de redefinição expirou.

    Trata datas timezone-aware e timezone-naive para evitar erros de comparação,
    dependendo de como o PostgreSQL/SQLAlchemy devolver o campo.
    """
    from datetime import datetime, timezone

    expires_at = user.password_reset_expires_at

    if expires_at is None:
        return True

    now = datetime.now(timezone.utc)

    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    return expires_at < now


def clear_password_reset_code(db: Session, user: User) -> User:
    """
    Remove o código temporário de redefinição após uso.
    """
    user.password_reset_code_hash = None
    user.password_reset_expires_at = None

    db.add(user)
    db.commit()
    db.refresh(user)

    return user


def reset_user_password_and_keys(db: Session, user: User, reset_data) -> User:
    """
    Redefine a password e atualiza o material criptográfico do utilizador.

    Fluxo esperado:
    - O frontend valida o código.
    - O frontend usa a recovery key para recuperar a chave privada antiga.
    - O frontend cifra novamente a mesma chave privada com a nova password.
    - O frontend gera uma nova recovery key e envia a nova cópia cifrada.
    - O backend guarda apenas material cifrado, nunca a chave privada em claro.
    """
    user.password_hash = hash_password(reset_data.new_password)

    user.kdf_salt = reset_data.kdf_salt
    user.kdf_iterations = reset_data.kdf_iterations
    user.kdf_hash = reset_data.kdf_hash
    user.public_key = reset_data.public_key
    user.encrypted_private_key = reset_data.encrypted_private_key
    user.private_key_iv = reset_data.private_key_iv
    user.encrypted_private_key_recovery = reset_data.encrypted_private_key_recovery
    user.recovery_key_iv = reset_data.recovery_key_iv
    user.key_algorithm = reset_data.key_algorithm

    user.password_reset_code_hash = None
    user.password_reset_expires_at = None

    db.add(user)
    db.commit()
    db.refresh(user)

    return user


def create_file(db: Session, file_data: File_Create) -> File:
    """
    Cria o registo de metadados do ficheiro na BD principal.

    Nota importante:
    - A encrypted_file_key NÃO pertence ao backend.
    - A chave AES do ficheiro, cifrada com a public key do utilizador,
      deve ser guardada apenas no keyserver.
    """
    db_file = File(
        filename=file_data.filename,
        owner_id=file_data.owner_id,
        parts=file_data.parts or [],
        encryption_mode=file_data.encryption_mode,
        file_iv=file_data.file_iv,
        file_size=file_data.file_size,
        original_file_size=file_data.original_file_size,
        file_hash=file_data.file_hash,
    )

    db.add(db_file)
    db.commit()
    db.refresh(db_file)

    return db_file

def update_file_parts(db: Session, file_id: int, owner_id: int, parts: list[dict[str, str]]) -> File | None:
    db_file = get_file_by_id_and_owner(db, file_id, owner_id)
    if not db_file:
        return None
    db_file.parts = parts
    db.commit()
    db.refresh(db_file)
    return db_file