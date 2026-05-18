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
    MfaLoginVerify,
    MfaLoginRecovery,
    MfaToggleRequestResponse,
    MfaToggleConfirm,
    MfaToggleResponse,
)
from app.core.config import settings
from app.services.auth_service import verify_password, hash_password, create_access_token, get_current_user
from app.services.email_service import EmailSendError, send_mfa_code, send_password_reset_code


router = APIRouter(
    prefix="/users",
    tags=["users"],
)

PASSWORD_RESET_EXPIRE_MINUTES = 15
MFA_CODE_EXPIRE_MINUTES = 10


def _email_delivery_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=(
            "Não foi possível enviar o email de validação. "
            "Confirme se o serviço de email está disponível e tente novamente."
        ),
    )


def _maybe_return_code(code: str | None) -> str | None:
    # Em produção deve estar sempre desativado. Os códigos são enviados por email real.
    return code if settings.EMAIL_RETURN_CODES else None


def _token_response_for_user(user: User) -> TokenResponse:
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
        mfa_required=False,
    )


def _create_mfa_challenge(db: Session, user: User, purpose: str) -> tuple[str, str]:
    code = f"{secrets.randbelow(1_000_000):06d}"
    challenge_id = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=MFA_CODE_EXPIRE_MINUTES)

    crud.set_mfa_code(
        db=db,
        user=user,
        code_hash=hash_password(code),
        expires_at=expires_at,
        challenge_id=challenge_id,
        purpose=purpose,
    )

    return challenge_id, code


def _validate_mfa_code(user: User, challenge_id: str | None, code: str | None, purpose: str) -> None:
    if (
        not challenge_id
        or not code
        or user.mfa_code_hash is None
        or user.mfa_challenge_id != challenge_id
        or user.mfa_code_purpose != purpose
        or crud.is_mfa_code_expired(user)
        or not verify_password(code, user.mfa_code_hash)
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Código MFA inválido ou expirado.",
        )



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

    if user.mfa_enabled:
        challenge_id, code = _create_mfa_challenge(db, user, purpose="login")
        try:
            send_mfa_code(user.email, code, MFA_CODE_EXPIRE_MINUTES, purpose="login")
        except EmailSendError as exc:
            crud.clear_mfa_code(db, user)
            raise _email_delivery_error() from exc

        return TokenResponse(
            mfa_required=True,
            mfa_challenge_id=challenge_id,
            dev_mfa_code=_maybe_return_code(code),
            message="MFA obrigatório. Introduza o código enviado por email ou use a recovery key.",
        )

    return _token_response_for_user(user)


@router.post("/login/mfa/verify", response_model=TokenResponse)
def verify_login_mfa(
    mfa_data: MfaLoginVerify,
    db: Session = Depends(get_db),
) -> TokenResponse:
    user = crud.get_user_by_email(db, str(mfa_data.email).lower())

    if not user or not verify_password(mfa_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou password incorretos.",
        )

    _validate_mfa_code(user, mfa_data.challenge_id, mfa_data.code, purpose="login")
    crud.clear_mfa_code(db, user)

    return _token_response_for_user(user)


@router.post("/login/mfa/recovery", response_model=TokenResponse)
def login_with_recovery_key(
    mfa_data: MfaLoginRecovery,
    db: Session = Depends(get_db),
) -> TokenResponse:
    user = crud.get_user_by_email(db, str(mfa_data.email).lower())

    if not user or not verify_password(mfa_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou password incorretos.",
        )

    if not user.mfa_enabled:
        return _token_response_for_user(user)

    if not user.recovery_key_hash or user.recovery_key_hash != mfa_data.recovery_key_hash:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Recovery key inválida.",
        )

    crud.clear_mfa_code(db, user)
    return _token_response_for_user(user)


@router.get("/me", response_model=UserMeResponse)
def read_current_user(current_user: User = Depends(get_current_user)) -> UserMeResponse:
    return current_user


@router.post("/mfa/request-toggle", response_model=MfaToggleRequestResponse)
def request_mfa_toggle(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MfaToggleRequestResponse:
    """Gera e envia por email um código para ativar/desativar MFA."""
    challenge_id, code = _create_mfa_challenge(db, current_user, purpose="toggle")

    try:
        send_mfa_code(current_user.email, code, MFA_CODE_EXPIRE_MINUTES, purpose="toggle")
    except EmailSendError as exc:
        crud.clear_mfa_code(db, current_user)
        raise _email_delivery_error() from exc

    return MfaToggleRequestResponse(
        message="Código MFA enviado por email.",
        challenge_id=challenge_id,
        dev_mfa_code=_maybe_return_code(code),
        expires_in_minutes=MFA_CODE_EXPIRE_MINUTES,
    )


@router.post("/mfa/toggle", response_model=MfaToggleResponse)
def confirm_mfa_toggle(
    toggle_data: MfaToggleConfirm,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MfaToggleResponse:
    used_code = bool(toggle_data.code)
    used_recovery = bool(toggle_data.recovery_key_hash)

    if used_code:
        _validate_mfa_code(
            current_user,
            toggle_data.challenge_id,
            toggle_data.code,
            purpose="toggle",
        )
    elif used_recovery:
        if not current_user.recovery_key_hash or current_user.recovery_key_hash != toggle_data.recovery_key_hash:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Recovery key inválida.",
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Introduza o código MFA ou use a recovery key.",
        )

    user = crud.set_mfa_enabled(db, current_user, toggle_data.enable)
    return MfaToggleResponse(
        mfa_enabled=user.mfa_enabled,
        message="MFA ativado com sucesso." if user.mfa_enabled else "MFA desativado com sucesso.",
    )


@router.post("/password-reset/request", response_model=PasswordResetRequestResponse)
def request_password_reset(
    reset_request: PasswordResetRequest,
    db: Session = Depends(get_db),
) -> PasswordResetRequestResponse:
    """Cria um código temporário de redefinição e envia-o por email."""
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

    try:
        send_password_reset_code(user.email, code, PASSWORD_RESET_EXPIRE_MINUTES)
    except EmailSendError as exc:
        crud.clear_password_reset_code(db, user)
        raise _email_delivery_error() from exc

    return PasswordResetRequestResponse(
        message=message,
        dev_reset_code=_maybe_return_code(code),
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
