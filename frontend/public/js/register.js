document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("form");

    if (!form) {
        console.error("Formulário de registo não encontrado.");
        return;
    }

    const requiredCryptoFields = [
        "kdf_salt",
        "kdf_iterations",
        "kdf_hash",
        "public_key",
        "encrypted_private_key",
        "private_key_iv",
        "encrypted_private_key_recovery",
        "recovery_key_iv",
        "recovery_key_hash",
        "key_algorithm"
    ];

    // ── Validação da password no frontend ──────────────────────────────────
    function validatePassword(password) {
        const errors = [];
        if (password.length < 12)          errors.push("A password deve ter pelo menos 12 caracteres.");
        if (!/[A-Z]/.test(password))       errors.push("A password deve conter pelo menos uma letra maiúscula.");
        if (!/[a-z]/.test(password))       errors.push("A password deve conter pelo menos uma letra minúscula.");
        if (!/\d/.test(password))          errors.push("A password deve conter pelo menos um número.");
        if (!/[\W_]/.test(password))       errors.push("A password deve conter pelo menos um símbolo especial (ex: !, @, #).");
        return errors;
    }

    // ── Traduz erros Pydantic do backend para português ────────────────────
    function parseFriendlyRegisterError(message) {
        try {
            const parsed = JSON.parse(message);
            if (!Array.isArray(parsed)) return message;

            const friendly = parsed.map((e) => {
                const field = Array.isArray(e.loc) ? e.loc[e.loc.length - 1] : "";
                const type  = e.type || "";
                const msg   = e.msg  || "";

                if (field === "email")    return "O email introduzido não é válido.";
                if (field === "password") {
                    if (type === "string_too_short") return "A password deve ter pelo menos 12 caracteres.";
                    // Erros do validador de força (value_error com mensagem específica)
                    if (msg.includes("número") || msg.includes("número"))    return "A password deve conter pelo menos um número.";
                    if (msg.includes("maiúscula"))                            return "A password deve conter pelo menos uma letra maiúscula.";
                    if (msg.includes("minúscula"))                            return "A password deve conter pelo menos uma letra minúscula.";
                    if (msg.includes("símbolo") || msg.includes("especial")) return "A password deve conter pelo menos um símbolo especial.";
                    return msg || "Password inválida.";
                }
                if (msg.includes("already") || msg.includes("registado") || msg.includes("exists")) {
                    return "Este email já está registado. Tenta fazer login.";
                }
                return msg || `Campo inválido: ${field}`;
            });

            return friendly.join("\n");
        } catch (_) {
            // Mensagens simples do backend (não JSON)
            if (message.includes("already") || message.includes("registado")) {
                return "Este email já está registado. Tenta fazer login.";
            }
            return message;
        }
    }

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const submitButton = form.querySelector("button[type='submit']");
        const email           = document.getElementById("email").value.trim().toLowerCase();
        const password        = document.getElementById("password").value;
        const confirmPassword = document.getElementById("confirmPassword").value;

        // Validações no frontend antes de qualquer pedido ao servidor
        if (!email.includes("@")) {
            showBootstrapAlert("Introduz um email válido.", "warning");
            return;
        }

        if (password !== confirmPassword) {
            showBootstrapAlert("As passwords não coincidem.", "warning");
            return;
        }

        const passwordErrors = validatePassword(password);
        if (passwordErrors.length > 0) {
            showBootstrapAlert(passwordErrors.join("\n"), "warning");
            return;
        }

        try {
            if (submitButton) {
                submitButton.disabled = true;
                submitButton.textContent = "A criar conta...";
            }

            const cryptoMaterial = await generateUserCryptoMaterial(password);
            const { recovery_key, ...cryptoPayload } = cryptoMaterial;

            const missingFields = requiredCryptoFields.filter((field) => {
                const value = cryptoPayload[field];
                return value === undefined || value === null || value === "";
            });

            if (!recovery_key || missingFields.length > 0) {
                throw new Error(
                    "Não foi possível gerar a recovery key automaticamente. " +
                    "Atualiza a página e tenta novamente."
                );
            }

            const payload = { email, password, ...cryptoPayload };
            const data = await apiRequest("/users/register", "POST", payload);

            console.log("Utilizador criado:", data);

            form.classList.add("d-none");
            showRecoveryKeyAlert(recovery_key, {
                title: "Conta criada com sucesso",
                message: "Guarda esta recovery key num local seguro. Ela só aparece agora e permite recuperar os ficheiros se perderes a password.",
                nextHref: "./login.html",
                nextLabel: "Ir para o login"
            });
        } catch (error) {
            console.error(error);
            const friendly = parseFriendlyRegisterError(error.message);
            showBootstrapAlert(friendly, "danger");
        } finally {
            if (!form.classList.contains("d-none") && submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = "Criar conta";
            }
        }
    });
});