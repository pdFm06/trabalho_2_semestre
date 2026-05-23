// Ficheiro responsável por frontend/public/js/bootstrap_alerts.js.
function escapeHTML(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Mostra uma mensagem Bootstrap dinâmica ao utilizador.
function showBootstrapAlert(message, type = "info", options = {}) {
    const containerId = options.containerId || "alertContainer";
    const container = document.getElementById(containerId);

    if (!container) {
        console.warn(`Container de alertas não encontrado: #${containerId}`);
        return;
    }

    const dismissible = options.dismissible !== false;
    const title = options.title ? `<div class="fw-semibold mb-1">${escapeHTML(options.title)}</div>` : "";
    const extraClass = dismissible ? " alert-dismissible fade show" : "";
    const closeButton = dismissible
        ? '<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Fechar"></button>'
        : "";

    container.innerHTML = `
        <div class="alert alert-${escapeHTML(type)}${extraClass}" role="alert">
            ${title}
            <div>${escapeHTML(message)}</div>
            ${closeButton}
        </div>
    `;
}

// Mostra a recovery key com instruções e botão de cópia.
function showRecoveryKeyAlert(recoveryKey, options = {}) {
    const containerId = options.containerId || "alertContainer";
    const container = document.getElementById(containerId);

    if (!container) {
        console.warn(`Container de alertas não encontrado: #${containerId}`);
        return;
    }

    const title = options.title || "Recovery key gerada";
    const message = options.message || "Guarde esta chave num local seguro. Ela permite recuperar o acesso aos ficheiros se perder a password.";
    const nextHref = options.nextHref || "./login.html";
    const nextLabel = options.nextLabel || "Ir para o login";

    container.innerHTML = `
        <div class="alert alert-warning" role="alert">
            <h5 class="alert-heading">${escapeHTML(title)}</h5>
            <p class="mb-2">${escapeHTML(message)}</p>
            <pre class="bg-light border rounded p-3 mb-3 user-select-all text-break"><code>${escapeHTML(recoveryKey)}</code></pre>
            <div class="d-flex flex-column flex-sm-row gap-2">
                <button type="button" class="btn btn-outline-dark btn-sm" id="copyRecoveryKeyButton">
                    Copiar recovery key
                </button>
                <a href="${escapeHTML(nextHref)}" class="btn btn-primary btn-sm">
                    ${escapeHTML(nextLabel)}
                </a>
            </div>
            <div id="copyRecoveryKeyFeedback" class="form-text mt-2"></div>
        </div>
    `;

    const copyButton = document.getElementById("copyRecoveryKeyButton");
    const feedback = document.getElementById("copyRecoveryKeyFeedback");

    if (copyButton) {
        copyButton.addEventListener("click", async () => {
            try {
                await navigator.clipboard.writeText(recoveryKey);
                if (feedback) {
                    feedback.textContent = "Recovery key copiada.";
                }
            } catch (error) {
                console.error(error);
                if (feedback) {
                    feedback.textContent = "Não foi possível copiar automaticamente. Selecione e copie a chave manualmente.";
                }
            }
        });
    }
}
