from datetime import datetime, timedelta, timezone
import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db import crud
from app.db.models import User
from app.schema.user_schema import (
    UserCreate,
    UserResponse,
    UserLogin,
    TokenResponse,
    UserMeResponse,
    PasswordResetRequest,
    PasswordResetRequestResponse,
    PasswordResetVerify,
    PasswordResetVerifyResponse,
    PasswordResetConfirm,
    PasswordResetConfirmResponse,
)
from app.services.auth_service import verify_password, hash_password, create_access_token, get_current_user


router = APIRouter(
    prefix="/users",
    tags=["users"],
)

PASSWORD_RESET_EXPIRE_MINUTES = 15


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
def register_user(
    user_create: UserCreate,
    db: Session = Depends(get_db),
) -> UserResponse:
    existing_user = crud.get_user_by_email(
        db=db,
        email=str(user_create.email).lower(),
    )

    if existing_user is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email já registado.",
        )

    try:
        user = crud.create_user(db=db, user_create=user_create)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email já registado.",
        )

    return user


@router.post("/login", response_model=TokenResponse)
def login_user(
    user_data: UserLogin,
    db: Session = Depends(get_db),
) -> TokenResponse:
    user = crud.get_user_by_email(db, str(user_data.email).lower())

    if not user or not verify_password(user_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou password incorretos.",
        )

    token, expires_in = create_access_token(subject=user.id)

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        expires_in=expires_in,
        public_key=user.public_key,
        encrypted_private_key=user.encrypted_private_key,
        private_key_iv=user.private_key_iv,
        kdf_salt=user.kdf_salt,
        kdf_iterations=user.kdf_iterations,
        kdf_hash=user.kdf_hash,
        key_algorithm=user.key_algorithm,
    )


@router.get("/me", response_model=UserMeResponse)
def read_current_user(current_user: User = Depends(get_current_user)) -> UserMeResponse:
    return current_user


@router.post("/password-reset/request", response_model=PasswordResetRequestResponse)
def request_password_reset(
    reset_request: PasswordResetRequest,
    db: Session = Depends(get_db),
) -> PasswordResetRequestResponse:
    """Cria um código temporário de redefinição.

    Nota: este protótipo devolve o código na resposta para facilitar testes sem serviço de email.
    Em produção, o código deve ser enviado por email e nunca devolvido pela API.
    """
    email = str(reset_request.email).lower()
    user = crud.get_user_by_email(db, email)

    # Mensagem genérica para reduzir enumeração de contas.
    message = "Se o email existir, foi gerado um código de redefinição."

    if user is None:
        return PasswordResetRequestResponse(message=message, dev_reset_code=None)

    code = f"{secrets.randbelow(1_000_000):06d}"
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=PASSWORD_RESET_EXPIRE_MINUTES)

    crud.set_password_reset_code(
        db=db,
        user=user,
        code_hash=hash_password(code),
        expires_at=expires_at,
    )

    return PasswordResetRequestResponse(
        message=message,
        dev_reset_code=code,
        expires_in_minutes=PASSWORD_RESET_EXPIRE_MINUTES,
    )


@router.post("/password-reset/verify", response_model=PasswordResetVerifyResponse)
def verify_password_reset_code(
    reset_verify: PasswordResetVerify,
    db: Session = Depends(get_db),
) -> PasswordResetVerifyResponse:
    user = crud.get_user_by_email(db, str(reset_verify.email).lower())

    if (
        user is None
        or user.password_reset_code_hash is None
        or crud.is_password_reset_code_expired(user)
        or not verify_password(reset_verify.code, user.password_reset_code_hash)
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Código inválido ou expirado.",
        )

    return PasswordResetVerifyResponse(
        valid=True,
        message="Código válido. Pode definir uma nova password e usar a recovery key para manter acesso aos ficheiros antigos.",
        public_key=user.public_key,
        encrypted_private_key_recovery=user.encrypted_private_key_recovery,
        recovery_key_iv=user.recovery_key_iv,
        key_algorithm=user.key_algorithm,
    )


@router.post("/password-reset/confirm", response_model=PasswordResetConfirmResponse)
def confirm_password_reset(
    reset_data: PasswordResetConfirm,
    db: Session = Depends(get_db),
) -> PasswordResetConfirmResponse:
    user = crud.get_user_by_email(db, str(reset_data.email).lower())

    if (
        user is None
        or user.password_reset_code_hash is None
        or crud.is_password_reset_code_expired(user)
        or not verify_password(reset_data.code, user.password_reset_code_hash)
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Código inválido ou expirado.",
        )

    crud.reset_user_password_and_keys(db=db, user=user, reset_data=reset_data)

    return PasswordResetConfirmResponse(
        message=(
            "Password redefinida com sucesso. "
            "A chave privada antiga foi recuperada com a recovery key e cifrada novamente com a nova password."
        )
    )
