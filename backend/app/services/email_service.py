from __future__ import annotations

import re
import smtplib
from email.message import EmailMessage
from email.utils import formataddr

from app.core.config import settings


class EmailSendError(RuntimeError):
    """Erro ao enviar email pelo serviço SMTP configurado."""


_LOCAL_SMTP_HOSTS = {"mailpit", "localhost", "127.0.0.1", "0.0.0.0"}


def _is_valid_email(value: str) -> bool:
    return bool(re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", value or ""))


def _validate_email_settings() -> None:
    """Valida a configuração SMTP antes de tentar enviar.

    A aplicação foi configurada para entrega real de email. Por isso, quando
    SMTP_REQUIRE_REAL_DELIVERY=True, recusamos hosts locais como Mailpit ou
    localhost. Isto evita que os códigos MFA/reset fiquem presos num serviço de
    desenvolvimento em vez de chegarem à caixa real do utilizador.
    """
    missing = []

    if not settings.SMTP_HOST:
        missing.append("SMTP_HOST")
    if not settings.SMTP_PORT:
        missing.append("SMTP_PORT")
    if not settings.SMTP_USERNAME:
        missing.append("SMTP_USERNAME")
    if not settings.SMTP_PASSWORD:
        missing.append("SMTP_PASSWORD")
    if not settings.SMTP_FROM_EMAIL:
        missing.append("SMTP_FROM_EMAIL")

    if missing:
        raise EmailSendError(
            "Configuração SMTP incompleta. Variáveis em falta: " + ", ".join(missing)
        )

    if not _is_valid_email(settings.SMTP_FROM_EMAIL):
        raise EmailSendError("SMTP_FROM_EMAIL não é um endereço de email válido.")

    host = settings.SMTP_HOST.strip().lower()
    if settings.SMTP_REQUIRE_REAL_DELIVERY and host in _LOCAL_SMTP_HOSTS:
        raise EmailSendError(
            "SMTP_REQUIRE_REAL_DELIVERY está ativo, mas SMTP_HOST aponta para um serviço local. "
            "Configure um SMTP real, por exemplo Gmail, Outlook ou outro fornecedor."
        )

    if settings.SMTP_USE_TLS and settings.SMTP_USE_STARTTLS:
        raise EmailSendError(
            "Configuração SMTP inválida: use SMTP_USE_TLS=true para porta 465 OU "
            "SMTP_USE_STARTTLS=true para porta 587, mas não ambos."
        )


def _send_email(to_email: str, subject: str, text_body: str, html_body: str | None = None) -> None:
    """Envia um email real através do SMTP configurado.

    O destinatário é sempre o email do utilizador recebido pela função que chama
    este serviço. Assim, os códigos de MFA e de redefinição de password são
    submetidos ao fornecedor SMTP e seguem para a caixa de correio real do
    utilizador.
    """
    _validate_email_settings()

    if not _is_valid_email(to_email):
        raise EmailSendError("Destinatário inválido.")

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = formataddr((settings.SMTP_FROM_NAME, settings.SMTP_FROM_EMAIL))
    message["To"] = to_email
    message.set_content(text_body)

    if html_body:
        message.add_alternative(html_body, subtype="html")

    try:
        smtp_cls = smtplib.SMTP_SSL if settings.SMTP_USE_TLS else smtplib.SMTP
        with smtp_cls(
            settings.SMTP_HOST,
            settings.SMTP_PORT,
            timeout=settings.SMTP_TIMEOUT_SECONDS,
        ) as smtp:
            smtp.ehlo()
            if settings.SMTP_USE_STARTTLS:
                smtp.starttls()
                smtp.ehlo()
            smtp.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
            smtp.send_message(message)
    except Exception as exc:  # pragma: no cover - depende do serviço SMTP externo.
        raise EmailSendError(f"Não foi possível enviar o email: {exc}") from exc


def send_password_reset_code(to_email: str, code: str, expires_in_minutes: int) -> None:
    subject = "Código de redefinição de password"
    text_body = (
        "Olá,\n\n"
        "Foi pedido um código para redefinir a password da sua conta.\n\n"
        f"Código: {code}\n"
        f"Validade: {expires_in_minutes} minutos\n\n"
        "Se não pediu esta redefinição, ignore este email.\n"
    )
    html_body = f"""
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
        <h2>Redefinição de password</h2>
        <p>Foi pedido um código para redefinir a password da sua conta.</p>
        <p style="font-size: 24px; font-weight: 700; letter-spacing: 4px;">{code}</p>
        <p>Este código é válido durante <strong>{expires_in_minutes} minutos</strong>.</p>
        <p>Se não pediu esta redefinição, ignore este email.</p>
    </div>
    """
    _send_email(to_email, subject, text_body, html_body)


def send_mfa_code(to_email: str, code: str, expires_in_minutes: int, purpose: str) -> None:
    purpose_label = {
        "login": "iniciar sessão",
        "toggle": "alterar as definições de MFA",
    }.get(purpose, "confirmar a operação")

    subject = "Código de autenticação multifator"
    text_body = (
        "Olá,\n\n"
        f"Use este código para {purpose_label}.\n\n"
        f"Código: {code}\n"
        f"Validade: {expires_in_minutes} minutos\n\n"
        "Se não iniciou esta operação, altere a sua password e contacte o suporte.\n"
    )
    html_body = f"""
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
        <h2>Código MFA</h2>
        <p>Use este código para <strong>{purpose_label}</strong>.</p>
        <p style="font-size: 24px; font-weight: 700; letter-spacing: 4px;">{code}</p>
        <p>Este código é válido durante <strong>{expires_in_minutes} minutos</strong>.</p>
        <p>Se não iniciou esta operação, altere a sua password e contacte o suporte.</p>
    </div>
    """
    _send_email(to_email, subject, text_body, html_body)
