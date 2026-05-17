document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("passwordResetConfirmForm");
    const email = sessionStorage.getItem("password_reset_email");
    const code = sessionStorage.getItem("password_reset_code");
    const cryptoPayloadRaw = sessionStorage.getItem("password_reset_crypto_payload");

    if (!email || !code || !cryptoPayloadRaw) {
        showBootstrapAlert("Pedido de redefinição incompleto. A redirecionar para o início do processo...", "warning", { dismissible: false });
        setTimeout(() => {
            window.location.href = "./forgot_password_email.html";
        }, 1200);
        return;
    }

    if (!form) {
        console.error("Formulário de nova password não encontrado.");
        return;
    }

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const newPassword = document.getElementById("password").value;
        const confirmPassword = document.getElementById("confirmPassword").value;
        const recoveryKey = document.getElementById("recoveryKey").value;

        if (newPassword !== confirmPassword) {
            showBootstrapAlert("As passwords não coincidem.", "warning");
            return;
        }

        if (!recoveryKey.trim()) {
            showBootstrapAlert("Introduza a recovery key para manter acesso aos ficheiros antigos.", "warning");
            return;
        }

        try {
            const resetCryptoPayload = JSON.parse(cryptoPayloadRaw);
            const cryptoMaterial = await rebuildUserCryptoMaterialFromRecovery(
                newPassword,
                recoveryKey,
                resetCryptoPayload
            );

            const { recovery_key: newRecoveryKey, ...cryptoPayload } = cryptoMaterial;

            const payload = {
                email,
                code,
                new_password: newPassword,
                ...cryptoPayload
            };

            const response = await apiRequest(
                "/users/password-reset/confirm",
                "POST",
                payload
            );

            sessionStorage.removeItem("password_reset_email");
            sessionStorage.removeItem("password_reset_code");
            sessionStorage.removeItem("password_reset_crypto_payload");
            clearAccessToken();

            form.classList.add("d-none");
            showRecoveryKeyAlert(newRecoveryKey, {
                title: "Password redefinida com sucesso",
                message: `${response.message} Foi gerada uma nova recovery key. Guarde-a num local seguro; a anterior deixa de ser necessária.`,
                nextHref: "./login.html",
                nextLabel: "Voltar ao login"
            });
        } catch (error) {
            console.error(error);
            showBootstrapAlert(`Erro ao redefinir password: ${error.message}`, "danger");
        }
    });
});
