// Ficheiro responsável por frontend/public/js/password_reset_request.js.
document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("passwordResetRequestForm");
    if (!form) {
        console.error("Formulário de pedido de redefinição não encontrado.");
        return;
    }

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const email = document.getElementById("email").value.trim().toLowerCase();

        try {
            const response = await apiRequest(
                "/users/password-reset/request",
                "POST",
                { email }
            );

            sessionStorage.setItem("password_reset_email", email);

            sessionStorage.removeItem("password_reset_code");

            showBootstrapAlert(`${response.message} Verifique a caixa de email para obter o código. A redirecionar para a verificação...`, "success", { dismissible: false });

            setTimeout(() => {
                window.location.href = "./forgot_password_codigo.html";
            }, 1200);
        } catch (error) {
            console.error(error);
            showBootstrapAlert(`Erro ao pedir redefinição: ${error.message}`, "danger");
        }
    });
});
