document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("passwordResetVerifyForm");
    const email = sessionStorage.getItem("password_reset_email");
    const hint = document.getElementById("resetCodeHint");

    if (!email) {
        showBootstrapAlert("Primeiro indique o email da conta. A redirecionar...", "warning", { dismissible: false });
        setTimeout(() => {
            window.location.href = "./forgot_password_email.html";
        }, 1200);
        return;
    }

    if (hint) {
        hint.textContent = "Introduza o código recebido por email.";
        hint.classList.remove("d-none");
    }

    if (!form) {
        console.error("Formulário de verificação de código não encontrado.");
        return;
    }

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const code = document.getElementById("code").value.trim();

        try {
            const response = await apiRequest(
                "/users/password-reset/verify",
                "POST",
                { email, code }
            );

            sessionStorage.setItem("password_reset_code", code);
            sessionStorage.setItem("password_reset_crypto_payload", JSON.stringify({
                public_key: response.public_key,
                encrypted_private_key_recovery: response.encrypted_private_key_recovery,
                recovery_key_iv: response.recovery_key_iv,
                key_algorithm: response.key_algorithm
            }));

            showBootstrapAlert(`${response.message} A redirecionar para a nova password...`, "success", { dismissible: false });

            setTimeout(() => {
                window.location.href = "./forgot_password_password.html";
            }, 900);
        } catch (error) {
            console.error(error);
            showBootstrapAlert(`Erro na verificação: ${error.message}`, "danger");
        }
    });
});
