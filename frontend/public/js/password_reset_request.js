document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("passwordResetRequestForm");
    const devCodeBox = document.getElementById("devResetCodeBox");

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

            if (response.dev_reset_code) {
                sessionStorage.setItem("password_reset_code", response.dev_reset_code);
                devCodeBox.classList.remove("d-none");
                devCodeBox.textContent = `Código de teste: ${response.dev_reset_code}`;
            }

            showBootstrapAlert(`${response.message} A redirecionar para a verificação do código...`, "success", { dismissible: false });

            setTimeout(() => {
                window.location.href = "./forgot_password_codigo.html";
            }, 1200);
        } catch (error) {
            console.error(error);
            showBootstrapAlert(`Erro ao pedir redefinição: ${error.message}`, "danger");
        }
    });
});
