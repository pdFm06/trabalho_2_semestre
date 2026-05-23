from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from datetime import datetime

from app.services.auth_service import validate_password_strength


class UserCryptoMaterial(BaseModel):
    # Agrupa os campos criptográficos enviados no registo ou reset de password.
    kdf_salt: str = Field(min_length=8)
    kdf_iterations: int = Field(default=600000, ge=100000)
    kdf_hash: str = Field(default="SHA-256")
    public_key: str = Field(min_length=32)
    encrypted_private_key: str = Field(min_length=32)
    private_key_iv: str = Field(min_length=8)

    encrypted_private_key_recovery: str = Field(min_length=32)
    recovery_key_iv: str = Field(min_length=8)

    recovery_key_hash: str | None = None

    key_algorithm: str = Field(default="RSA-OAEP-4096-SHA-256")

    @field_validator("kdf_hash")
    @classmethod
    def validate_kdf_hash(cls, value):
        # Garante que o algoritmo de hash da KDF é o esperado.
        if value != "SHA-256":
            raise ValueError("Neste protótipo, apenas SHA-256 é suportado para PBKDF2.")
        return value


class UserCreate(UserCryptoMaterial):
    # Define os dados necessários para criar uma conta.
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
        # Valida a força da password no registo.
        return validate_password_strength(password)


class UserLogin(BaseModel):
    # Define os dados necessários para autenticação.
    email: EmailStr
    password: str


class PasswordResetRequest(BaseModel):
    # Define o pedido inicial de recuperação de password.
    email: EmailStr


class PasswordResetVerify(BaseModel):
    # Define os dados necessários para validar o código de recuperação.
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)


class PasswordResetConfirm(UserCryptoMaterial):
    # Define os dados necessários para confirmar a nova password e chaves.
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)
    new_password: str = Field(min_length=12)

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, password):
        # Valida a nova password usada na recuperação.
        return validate_password_strength(password)


class PasswordResetRequestResponse(BaseModel):
    # Define a resposta ao pedido de recuperação de password.
    message: str
    dev_reset_code: str | None = None
    expires_in_minutes: int = 15


class PasswordResetVerifyResponse(BaseModel):
    # Define a resposta após validação do código de recuperação.
    valid: bool
    message: str

    public_key: str | None = None
    encrypted_private_key_recovery: str | None = None
    recovery_key_iv: str | None = None
    key_algorithm: str | None = None


class PasswordResetConfirmResponse(BaseModel):
    # Define a resposta final do reset de password.
    message: str


class TokenResponse(BaseModel):
    # Define a resposta de autenticação, incluindo JWT e material criptográfico cifrado.
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
    # Define a resposta pública de um utilizador.
    id: int
    email: EmailStr
    is_active: bool
    mfa_enabled: bool = False
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserMeResponse(BaseModel):
    # Define os dados devolvidos ao próprio utilizador autenticado.
    id: int
    email: EmailStr
    is_active: bool
    mfa_enabled: bool = False
    public_key: str
    encrypted_private_key: str
    private_key_iv: str
    kdf_salt: str
    kdf_iterations: int
    kdf_hash: str
    key_algorithm: str
    storage_quota: int
    storage_used: int

    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class MfaLoginVerify(BaseModel):
    # Define os dados para confirmar MFA no login.
    email: EmailStr
    password: str
    challenge_id: str
    code: str = Field(min_length=6, max_length=6)


class MfaLoginRecovery(BaseModel):
    # Define os dados para confirmar MFA usando recovery key.
    email: EmailStr
    password: str
    recovery_key_hash: str


class MfaToggleRequestResponse(BaseModel):
    # Define a resposta ao pedido de ativação/desativação de MFA.
    message: str
    challenge_id: str
    dev_mfa_code: str | None = None
    expires_in_minutes: int = 10


class MfaToggleConfirm(BaseModel):
    # Define os dados para confirmar a alteração de MFA.
    enable: bool
    challenge_id: str | None = None
    code: str | None = None
    recovery_key_hash: str | None = None


class MfaToggleResponse(BaseModel):
    # Define a resposta final da alteração do estado MFA.
    mfa_enabled: bool
    message: str
