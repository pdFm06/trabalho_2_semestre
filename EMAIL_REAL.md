# Envio real de emails

Este projeto está configurado para enviar códigos de MFA e redefinição de password para a caixa real do utilizador através de SMTP.

## 1. Criar `.env`

Copia o exemplo:

```bash
cp .env.example .env
```

Depois edita o `.env` com as credenciais reais do fornecedor de email.

## 2. Gmail

Exemplo:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=o_teu_email@gmail.com
SMTP_PASSWORD=app_password_do_gmail
SMTP_FROM_EMAIL=o_teu_email@gmail.com
SMTP_FROM_NAME=Cloud Segura
SMTP_USE_TLS=false
SMTP_USE_STARTTLS=true
SMTP_REQUIRE_REAL_DELIVERY=true
EMAIL_RETURN_CODES=false
```

No Gmail, usa uma App Password, não a password normal da conta.

## 3. Outlook/Hotmail

Exemplo:

```env
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_USERNAME=o_teu_email@outlook.com
SMTP_PASSWORD=password_ou_app_password
SMTP_FROM_EMAIL=o_teu_email@outlook.com
SMTP_FROM_NAME=Cloud Segura
SMTP_USE_TLS=false
SMTP_USE_STARTTLS=true
SMTP_REQUIRE_REAL_DELIVERY=true
EMAIL_RETURN_CODES=false
```

## 4. Arrancar

```bash
docker compose down
docker compose up --build
```

Se alguma variável SMTP obrigatória estiver em falta, o Docker Compose não arranca o backend. Isto evita que os códigos fiquem num serviço local por engano.

## 5. Fluxos afetados

- Reset de password: o código é enviado para o email da conta.
- MFA no login: o código é enviado para o email da conta.
- Ativar/desativar MFA: o código é enviado para o email da conta.

A API não devolve os códigos, porque `EMAIL_RETURN_CODES=false`.

## Nota

O backend submete o email ao servidor SMTP configurado. A entrega final na caixa de entrada depende do fornecedor SMTP, reputação da conta/domínio e filtros anti-spam. Verifica também a pasta de spam/lixo.
