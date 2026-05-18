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

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const submitButton = form.querySelector("button[type='submit']");
        const email = document.getElementById("email").value.trim().toLowerCase();
        const password = document.getElementById("password").value;
        const confirmPassword = document.getElementById("confirmPassword").value;

        if (password !== confirmPassword) {
            showBootstrapAlert("As passwords não coincidem.", "warning");
            return;
        }

        try {
            if (submitButton) {
                submitButton.disabled = true;
                submitButton.textContent = "A criar conta...";
            }

            // A recovery key é criada automaticamente aqui.
            // O utilizador NÃO tem de introduzir recovery key no registo.
            const cryptoMaterial = await generateUserCryptoMaterial(password);
            const { recovery_key, ...cryptoPayload } = cryptoMaterial;

            const missingFields = requiredCryptoFields.filter((field) => {
                const value = cryptoPayload[field];
                return value === undefined || value === null || value === "";
            });

            if (!recovery_key || missingFields.length > 0) {
                throw new Error(
                    "Não foi possível gerar a recovery key automaticamente. " +
                    "Atualize a página e tente novamente. Campos em falta: " +
                    missingFields.join(", ")
                );
            }

            const payload = {
                email,
                password,
                ...cryptoPayload
            };

            const data = await apiRequest("/users/register", "POST", payload);

            console.log("Utilizador criado:", data);
            console.log("Recovery key do utilizador:", recovery_key);

            form.classList.add("d-none");
            showRecoveryKeyAlert(recovery_key, {
                title: "Conta criada com sucesso",
                message: "Guarde esta recovery key num local seguro. Ela só aparece agora e permite recuperar os ficheiros se perder a password.",
                nextHref: "./login.html",
                nextLabel: "Ir para o login"
            });
        } catch (error) {
            console.error(error);
            showBootstrapAlert(`Erro no registo: ${error.message}`, "danger");
        } finally {
            if (!form.classList.contains("d-none") && submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = "Criar conta";
            }
        }
    });
});
