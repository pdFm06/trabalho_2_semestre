from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
import re
from datetime import datetime


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


class UserCryptoMaterial(BaseModel):
    # Campos gerados no browser para Client-Side Encryption.
    kdf_salt: str = Field(min_length=8)
    kdf_iterations: int = Field(default=600000, ge=100000)
    kdf_hash: str = Field(default="SHA-256")
    public_key: str = Field(min_length=32)
    encrypted_private_key: str = Field(min_length=32)
    private_key_iv: str = Field(min_length=8)

    # Segunda cópia da chave privada cifrada com a recovery key do utilizador.
    # A recovery key em claro nunca é enviada nem guardada no backend.
    encrypted_private_key_recovery: str = Field(min_length=32)
    recovery_key_iv: str = Field(min_length=8)

    # Hash/verificador da recovery key. A recovery key em claro nunca é enviada.
    recovery_key_hash: str | None = None

    key_algorithm: str = Field(default="RSA-OAEP-4096-SHA-256")

    @field_validator("kdf_hash")
    @classmethod
    def validate_kdf_hash(cls, value):
        if value != "SHA-256":
            raise ValueError("Neste protótipo, apenas SHA-256 é suportado para PBKDF2.")
        return value


class UserCreate(UserCryptoMaterial):
    email: EmailStr
    password: str = Field(min_length=12)

    public_key: str
    encrypted_private_key: str
    private_key_iv: str

    kdf_salt: str
    kdf_iterations: int
    kdf_hash: str = "SHA-256"
    key_algorithm: str = "RSA-OAEP-4096"

    encrypted_private_key_recovery: str
    recovery_key_iv: str
    recovery_key_hash: str | None = None

    @field_validator("password")
    @classmethod
    def validate_password(cls, password):
        return validate_password_strength(password)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetVerify(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)


class PasswordResetConfirm(UserCryptoMaterial):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)
    new_password: str = Field(min_length=12)

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, password):
        return validate_password_strength(password)


class PasswordResetRequestResponse(BaseModel):
    message: str
    # Apenas para demonstração/desenvolvimento. Numa versão real, o código seria enviado por email.
    dev_reset_code: str | None = None
    expires_in_minutes: int = 15


class PasswordResetVerifyResponse(BaseModel):
    valid: bool
    message: str

    # Material necessário para o frontend recuperar a chave privada antiga
    # com a recovery key. Estes campos só são devolvidos depois de o código
    # temporário de redefinição ser validado.
    public_key: str | None = None
    encrypted_private_key_recovery: str | None = None
    recovery_key_iv: str | None = None
    key_algorithm: str | None = None


class PasswordResetConfirmResponse(BaseModel):
    message: str


class TokenResponse(BaseModel):
    # Quando mfa_required=True, estes campos vêm vazios porque o token
    # só é emitido depois de validar o código MFA ou a recovery key.
    access_token: str | None = None
    token_type: str = "bearer"
    expires_in: int | None = None

    public_key: str | None = None
    encrypted_private_key: str | None = None
    private_key_iv: str | None = None
    kdf_salt: str | None = None
    kdf_iterations: int | None = None
    kdf_hash: str | None = None
    key_algorithm: str | None = None

    mfa_required: bool = False
    mfa_challenge_id: str | None = None
    dev_mfa_code: str | None = None
    message: str | None = None


class UserResponse(BaseModel):
    id: int
    email: EmailStr
    is_active: bool
    mfa_enabled: bool = False
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserMeResponse(BaseModel):
    id: int
    email: EmailStr
    is_active: bool
    mfa_enabled: bool = False
    public_key: str
    # Material criptográfico cifrado. É devolvido ao próprio utilizador autenticado
    # para permitir recarregar a chave privada em memória após refresh da página.
    encrypted_private_key: str
    private_key_iv: str
    kdf_salt: str
    kdf_iterations: int
    kdf_hash: str
    key_algorithm: str
    # Quotas de armazenamento
    storage_quota: int
    storage_used: int

    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class MfaLoginVerify(BaseModel):
    email: EmailStr
    password: str
    challenge_id: str
    code: str = Field(min_length=6, max_length=6)


class MfaLoginRecovery(BaseModel):
    email: EmailStr
    password: str
    recovery_key_hash: str


class MfaToggleRequestResponse(BaseModel):
    message: str
    challenge_id: str
    dev_mfa_code: str | None = None
    expires_in_minutes: int = 10


class MfaToggleConfirm(BaseModel):
    enable: bool
    challenge_id: str | None = None
    code: str | None = None
    recovery_key_hash: str | None = None


class MfaToggleResponse(BaseModel):
    mfa_enabled: bool
    message: str
