document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("loginForm");

    if (!form) {
        console.error("Formulário de login não encontrado.");
        return;
    }

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const email = document.getElementById("email").value.trim().toLowerCase();
        const password = document.getElementById("password").value;

        try {
            const response = await apiRequest(
                "/users/login",
                "POST",
                { email, password }
            );

            setAccessToken(response.access_token);

            // A chave privada é decifrada no browser e mantida apenas em memória.
            const privateKey = await decryptUserPrivateKey(password, response);
            const publicKey = await importUserPublicKey(response.public_key);

            window.cloudCryptoState.privateKey = privateKey;
            window.cloudCryptoState.publicKey = publicKey;

            // Nunca guardar a password nem a chave privada decifrada em localStorage/sessionStorage.
            document.getElementById("password").value = "";

            console.log("Login efetuado com sucesso. Chave privada carregada em memória.");
            showBootstrapAlert("Login efetuado com sucesso. A redirecionar...", "success", { dismissible: false });

            setTimeout(() => {
                window.location.href = "../main_page.html";
            }, 700);
        } catch (error) {
            console.error(error);
            clearAccessToken();
            showBootstrapAlert(`Erro no login: ${error.message}`, "danger");
        }
    });
});
