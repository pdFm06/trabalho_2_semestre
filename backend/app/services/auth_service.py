from datetime import datetime, timedelta, timezone
from typing import Any
import re

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.database import get_db
from app.db.models import User


password_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
)

security = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return password_context.hash(password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    return password_context.verify(plain_password, password_hash)


def create_access_token(subject: str | int, extra_claims: dict[str, Any] | None = None) -> tuple[str, int]:
    expires_delta = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    expire = datetime.now(timezone.utc) + expires_delta

    payload: dict[str, Any] = {
        "sub": str(subject),
        "exp": expire,
        "type": "access",
    }

    if extra_claims:
        payload.update(extra_claims)

    token = jwt.encode(
        payload,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )

    return token, int(expires_delta.total_seconds())


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
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

    return payload


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Autenticação necessária.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_access_token(credentials.credentials)

    try:
        user_id = int(payload["sub"])
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(User).filter(User.id == user_id).first()

    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Utilizador inexistente ou inativo.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


def validate_password_strength(password: str) -> str:
    if not re.search(r"\d", password):
        raise ValueError("A password deve conter pelo menos um número.")
    if not re.search(r"[A-Z]", password):
        raise ValueError("A password deve conter pelo menos uma letra maiúscula.")
    if not re.search(r"[a-z]", password):
        raise ValueError("A password deve conter pelo menos uma letra minúscula.")
    if not re.search(r"\W", password):
        raise ValueError("A password deve conter pelo menos um símbolo especial.")
    return password
