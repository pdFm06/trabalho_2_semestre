let pendingMfaLogin = null;

async function completeLogin(password, response) {
    if (!response?.access_token) {
        throw new Error("Resposta de login inválida: token em falta.");
    }

    setAccessToken(response.access_token);

    const privateKey = await decryptUserPrivateKey(password, response);
    const publicKey = await importUserPublicKey(response.public_key);

    window.cloudCryptoState.privateKey = privateKey;
    window.cloudCryptoState.publicKey = publicKey;

    showBootstrapAlert("Login efetuado com sucesso. A redirecionar...", "success", { dismissible: false });

    setTimeout(() => {
        window.location.href = "../main_page.html";
    }, 700);
}

// ── Utilitário: mostrar erro DENTRO do modal MFA ──────────────────────────────
function showMfaError(message) {
    const alertEl = document.getElementById("mfaLoginAlert");
    if (alertEl) {
        alertEl.className = "alert alert-danger small";
        alertEl.textContent = message;
    }
}

function resetMfaAlert() {
    const alertEl = document.getElementById("mfaLoginAlert");
    if (alertEl) {
        alertEl.className = "alert alert-info small";
        alertEl.textContent = "Introduza o código recebido por email. Em alternativa, pode usar a recovery key.";
    }
}

function ensureMfaModal() {
    if (document.getElementById("mfaLoginModal")) return;

    const modalHtml = `
        <div class="modal fade" id="mfaLoginModal" tabindex="-1" aria-labelledby="mfaLoginModalLabel" aria-hidden="true">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header">
                        <h1 class="modal-title fs-5" id="mfaLoginModalLabel">Verificação MFA</h1>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
                    </div>
                    <div class="modal-body">
                        <div id="mfaLoginAlert" class="alert alert-info small" role="alert">
                            Introduza o código recebido por email. Em alternativa, pode usar a recovery key.
                        </div>

                        <div class="mb-3">
                            <label for="mfaLoginCode" class="form-label">Código MFA</label>
                            <input type="text" inputmode="numeric" maxlength="6" class="form-control" id="mfaLoginCode" placeholder="000000">
                        </div>

                        <hr>

                        <div class="mb-3">
                            <label for="mfaLoginRecoveryKey" class="form-label">Recovery key</label>
                            <textarea class="form-control" id="mfaLoginRecoveryKey" rows="3" placeholder="Use esta opção se não tiver acesso ao email"></textarea>
                            <div class="form-text">Use apenas uma das opções: código MFA ou recovery key.</div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                        <button type="button" id="mfaLoginRecoveryBtn" class="btn btn-outline-primary">Usar recovery key</button>
                        <button type="button" id="mfaLoginCodeBtn" class="btn btn-primary">Validar código</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML("beforeend", modalHtml);

    document.getElementById("mfaLoginCodeBtn")?.addEventListener("click", submitMfaCodeLogin);
    document.getElementById("mfaLoginRecoveryBtn")?.addEventListener("click", submitMfaRecoveryLogin);
}

function showMfaModal(response) {
    ensureMfaModal();

    const codeInput    = document.getElementById("mfaLoginCode");
    const recoveryInput = document.getElementById("mfaLoginRecoveryKey");

    if (codeInput)     codeInput.value = "";
    if (recoveryInput) recoveryInput.value = "";

    // Resetar alerta para estado informativo
    resetMfaAlert();

    // Em modo dev, mostrar o código directamente no alerta
    if (response.dev_mfa_code) {
        const alertEl = document.getElementById("mfaLoginAlert");
        if (alertEl) {
            alertEl.className = "alert alert-info small";
            alertEl.innerHTML = `Código MFA: <strong>${response.dev_mfa_code}</strong>`;
        }
    }

    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById("mfaLoginModal"));
    modal.show();
}

async function submitMfaCodeLogin() {
    if (!pendingMfaLogin) return;

    const code = document.getElementById("mfaLoginCode")?.value.trim();

    if (!code) {
        showMfaError("Introduz o código MFA antes de validar.");
        return;
    }

    try {
        const response = await apiRequest("/users/login/mfa/verify", "POST", {
            email:        pendingMfaLogin.email,
            password:     pendingMfaLogin.password,
            challenge_id: pendingMfaLogin.challengeId,
            code
        });

        bootstrap.Modal.getInstance(document.getElementById("mfaLoginModal"))?.hide();
        await completeLogin(pendingMfaLogin.password, response);
        pendingMfaLogin = null;
    } catch (error) {
        console.error(error);
        showMfaError("Código MFA inválido ou expirado. Tenta novamente.");
    }
}

async function submitMfaRecoveryLogin() {
    if (!pendingMfaLogin) return;

    const recoveryKey = document.getElementById("mfaLoginRecoveryKey")?.value.trim();

    if (!recoveryKey) {
        showMfaError("Introduz a recovery key antes de continuar.");
        return;
    }

    try {
        const recoveryKeyHash = await recoveryKeyHashForServer(recoveryKey);
        const response = await apiRequest("/users/login/mfa/recovery", "POST", {
            email:             pendingMfaLogin.email,
            password:          pendingMfaLogin.password,
            recovery_key_hash: recoveryKeyHash
        });

        bootstrap.Modal.getInstance(document.getElementById("mfaLoginModal"))?.hide();
        await completeLogin(pendingMfaLogin.password, response);
        pendingMfaLogin = null;
    } catch (error) {
        console.error(error);
        showMfaError("Recovery key inválida ou expirada. Confirma se copiaste a chave completa.");
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("loginForm");

    if (!form) {
        console.error("Formulário de login não encontrado.");
        return;
    }

    ensureMfaModal();

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const email    = document.getElementById("email").value.trim().toLowerCase();
        const password = document.getElementById("password").value;

        try {
            const response = await apiRequest("/users/login", "POST", { email, password });

            if (response.mfa_required) {
                clearAccessToken();
                pendingMfaLogin = {
                    email,
                    password,
                    challengeId: response.mfa_challenge_id
                };
                showMfaModal(response);
                return;
            }

            document.getElementById("password").value = "";
            await completeLogin(password, response);
        } catch (error) {
            console.error(error);
            clearAccessToken();
            showBootstrapAlert("Email ou password inválidos.", "danger");
        }
    });
});