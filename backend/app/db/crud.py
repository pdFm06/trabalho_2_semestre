from app.schema.file_schema import File_Create
from sqlalchemy.orm import Session
from app.db.models import User, File, Folder
from app.schema.user_schema import UserCreate
from app.services.auth_service import hash_password


def get_files_by_owner(db: Session, owner_id: int) -> list[File]:
    # Obtém todos os ficheiros pertencentes a um utilizador.
    return db.query(File).filter(File.owner_id == owner_id).order_by(File.created_at.desc()).all()


def get_files_by_owner_and_folder(db: Session, owner_id: int, folder_id: int | None) -> list[File]:
    # Obtém os ficheiros de uma pasta específica do utilizador.
    query = db.query(File).filter(File.owner_id == owner_id)
    if folder_id is None:
        query = query.filter(File.folder_id.is_(None))
    else:
        query = query.filter(File.folder_id == folder_id)
    return query.order_by(File.created_at.desc()).all()


def get_folder_by_id_and_owner(db: Session, folder_id: int, owner_id: int) -> Folder | None:
    # Procura uma pasta pelo identificador e confirma que pertence ao utilizador.
    return db.query(Folder).filter(Folder.id == folder_id, Folder.owner_id == owner_id).first()


def get_folders_by_owner(db: Session, owner_id: int) -> list[Folder]:
    # Obtém todas as pastas de um utilizador.
    return db.query(Folder).filter(Folder.owner_id == owner_id).order_by(Folder.parent_id.asc().nullsfirst(), Folder.name.asc()).all()


def get_folders_by_owner_and_parent(db: Session, owner_id: int, parent_id: int | None) -> list[Folder]:
    # Obtém as subpastas de uma pasta específica.
    query = db.query(Folder).filter(Folder.owner_id == owner_id)
    if parent_id is None:
        query = query.filter(Folder.parent_id.is_(None))
    else:
        query = query.filter(Folder.parent_id == parent_id)
    return query.order_by(Folder.name.asc()).all()


def get_folder_breadcrumbs(db: Session, folder: Folder | None, owner_id: int) -> list[Folder]:
    # Constrói o caminho hierárquico desde a raiz até à pasta atual.
    breadcrumbs: list[Folder] = []
    current = folder
    seen: set[int] = set()

    while current is not None and current.id not in seen:
        seen.add(current.id)
        breadcrumbs.append(current)
        if current.parent_id is None:
            break
        current = get_folder_by_id_and_owner(db, current.parent_id, owner_id)

    breadcrumbs.reverse()
    return breadcrumbs


def create_folder(db: Session, owner_id: int, name: str, parent_id: int | None = None) -> Folder:
    # Cria uma nova pasta para o utilizador autenticado.
    cleaned_name = name.strip()

    existing_query = db.query(Folder).filter(Folder.owner_id == owner_id, Folder.name == cleaned_name)
    if parent_id is None:
        existing_query = existing_query.filter(Folder.parent_id.is_(None))
    else:
        existing_query = existing_query.filter(Folder.parent_id == parent_id)

    if existing_query.first():
        raise ValueError("Já existe uma pasta com esse nome nesta localização.")

    db_folder = Folder(name=cleaned_name, owner_id=owner_id, parent_id=parent_id)
    db.add(db_folder)
    db.commit()
    db.refresh(db_folder)
    return db_folder


def folder_has_children(db: Session, owner_id: int, folder_id: int) -> bool:
    # Verifica se uma pasta contém ficheiros ou subpastas.
    has_files = db.query(File.id).filter(File.owner_id == owner_id, File.folder_id == folder_id).first() is not None
    has_folders = db.query(Folder.id).filter(Folder.owner_id == owner_id, Folder.parent_id == folder_id).first() is not None
    return has_files or has_folders


def delete_folder(db: Session, owner_id: int, folder_id: int) -> Folder | None:
    # Elimina uma pasta vazia pertencente ao utilizador autenticado.
    folder = get_folder_by_id_and_owner(db, folder_id, owner_id)
    if not folder:
        return None
    db.delete(folder)
    db.commit()
    return folder

def get_file_by_id_and_owner(db: Session, file_id: int, owner_id: int) -> File | None:
    # Descreve a lógica associada a get_file_by_id_and_owner.
    return db.query(File).filter(File.id == file_id, File.owner_id == owner_id).first()

def move_file_to_folder(db: Session, file_id: int, owner_id: int, folder_id: int | None) -> File | None:
    # Altera a pasta associada a um ficheiro do utilizador.
    db_file = get_file_by_id_and_owner(db, file_id, owner_id)
    if not db_file:
        return None

    if folder_id is not None and not get_folder_by_id_and_owner(db, folder_id, owner_id):
        raise ValueError("Pasta de destino não encontrada.")

    db_file.folder_id = folder_id
    db.commit()
    db.refresh(db_file)
    return db_file


def toggle_favorite(db: Session, file_id: int, owner_id: int) -> File | None:
    # Alterna o estado de favorito de um ficheiro do utilizador.
    db_file = get_file_by_id_and_owner(db, file_id, owner_id)
    if not db_file:
        return None
    db_file.is_favorite = not db_file.is_favorite
    db.commit()
    db.refresh(db_file)
    return db_file

def delete_file(db: Session, file_id: int, owner_id: int) -> File | None:
    # Apaga um ficheiro, remove as suas partes no MinIO e tenta apagar a chave no keyserver.
    db_file = get_file_by_id_and_owner(db, file_id, owner_id)
    if not db_file:
        return None

    owner = get_user_by_id(db, owner_id)
    if owner:
        owner.storage_used = max(0, (owner.storage_used or 0) - (db_file.file_size or 0))
        db.add(owner)

    db.delete(db_file)
    db.commit()
    return db_file

def get_user_by_email(db: Session, email: str) -> User | None:
    # Descreve a lógica associada a get_user_by_email.
    return db.query(User).filter(User.email == email).first()

def get_user_by_id(db: Session, user_id: int) -> User | None:
    # Descreve a lógica associada a get_user_by_id.
    return db.query(User).filter(User.id == user_id).first()

def create_user(db: Session, user_create: UserCreate):
    # Cria um utilizador e guarda o material criptográfico cifrado.
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
        recovery_key_hash=getattr(user_create, "recovery_key_hash", None),
    )

    db.add(db_user)
    db.commit()
    db.refresh(db_user)

    return db_user

def set_password_reset_code(db: Session, user: User, code_hash: str, expires_at) -> User:
    # Guarda o hash do código de recuperação e a respetiva data de expiração.
    user.password_reset_code_hash = code_hash
    user.password_reset_expires_at = expires_at

    db.add(user)
    db.commit()
    db.refresh(user)

    return user


def is_password_reset_code_expired(user: User) -> bool:
    # Verifica se o código de recuperação de password expirou.
    from datetime import datetime, timezone

    expires_at = user.password_reset_expires_at

    if expires_at is None:
        return True

    now = datetime.now(timezone.utc)

    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    return expires_at < now


def clear_password_reset_code(db: Session, user: User) -> User:
    # Remove os dados temporários associados ao reset de password.
    user.password_reset_code_hash = None
    user.password_reset_expires_at = None

    db.add(user)
    db.commit()
    db.refresh(user)

    return user


def reset_user_password_and_keys(db: Session, user: User, reset_data) -> User:
    # Atualiza password, chaves cifradas e recovery key após recuperação da conta.
    user.password_hash = hash_password(reset_data.new_password)

    user.kdf_salt = reset_data.kdf_salt
    user.kdf_iterations = reset_data.kdf_iterations
    user.kdf_hash = reset_data.kdf_hash
    user.public_key = reset_data.public_key
    user.encrypted_private_key = reset_data.encrypted_private_key
    user.private_key_iv = reset_data.private_key_iv
    user.encrypted_private_key_recovery = reset_data.encrypted_private_key_recovery
    user.recovery_key_iv = reset_data.recovery_key_iv
    user.recovery_key_hash = getattr(reset_data, "recovery_key_hash", None)
    user.key_algorithm = reset_data.key_algorithm

    user.password_reset_code_hash = None
    user.password_reset_expires_at = None

    db.add(user)
    db.commit()
    db.refresh(user)

    return user


def create_file(db: Session, file_data: File_Create) -> File:
    # Cria o registo de metadados de um ficheiro já armazenado no MinIO.
    db_file = File(
        filename=file_data.filename,
        owner_id=file_data.owner_id,
        folder_id=file_data.folder_id,
        parts=file_data.parts or [],
        encryption_mode=file_data.encryption_mode,
        file_iv=file_data.file_iv,
        file_size=file_data.file_size,
        original_file_size=file_data.original_file_size,
        file_hash=file_data.file_hash,
    )

    db.add(db_file)

    owner = get_user_by_id(db, file_data.owner_id)
    if owner:
        owner.storage_used = (owner.storage_used or 0) + (file_data.file_size or 0)
        db.add(owner)

    db.commit()
    db.refresh(db_file)

    return db_file


def set_mfa_code(db: Session, user: User, code_hash: str, expires_at, challenge_id: str, purpose: str) -> User:
    # Guarda o hash de um código MFA e os metadados do desafio.
    user.mfa_code_hash = code_hash
    user.mfa_code_expires_at = expires_at
    user.mfa_challenge_id = challenge_id
    user.mfa_code_purpose = purpose

    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def is_mfa_code_expired(user: User) -> bool:
    # Verifica se o código MFA expirou.
    from datetime import datetime, timezone

    expires_at = user.mfa_code_expires_at
    if expires_at is None:
        return True

    now = datetime.now(timezone.utc)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    return expires_at < now


def clear_mfa_code(db: Session, user: User) -> User:
    # Remove o código MFA temporário guardado no utilizador.
    user.mfa_code_hash = None
    user.mfa_code_expires_at = None
    user.mfa_challenge_id = None
    user.mfa_code_purpose = None

    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def set_mfa_enabled(db: Session, user: User, enabled: bool) -> User:
    # Ativa ou desativa o MFA do utilizador.
    user.mfa_enabled = enabled
    clear_mfa_code(db, user)
    db.refresh(user)
    return user
