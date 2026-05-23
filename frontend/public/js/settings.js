// Ficheiro responsável por frontend/public/js/settings.js.
const THEME_STORAGE_KEY = "app_theme";
let pendingMfaToggleChallengeId = null;

// Lê o tema guardado no browser.
function getSavedTheme() {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return saved === "dark" ? "dark" : "light";
}

// Atualiza o item ativo da sidebar.
function setSidebarActiveLink(viewName) {
    document.querySelectorAll("[data-app-view-link]").forEach((link) => {
        const isActive = link.dataset.appViewLink === viewName;
        link.classList.toggle("active", isActive);
        if (isActive) {
            link.setAttribute("aria-current", "page");
        } else {
            link.removeAttribute("aria-current");
        }
    });
}

// Aplica o tema claro ou escuro na aplicação.
function applyTheme(theme) {
    const normalizedTheme = theme === "dark" ? "dark" : "light";

    document.documentElement.setAttribute("data-bs-theme", normalizedTheme);
    document.documentElement.setAttribute("data-app-theme", normalizedTheme);
    document.body?.setAttribute("data-app-theme", normalizedTheme);

    localStorage.setItem(THEME_STORAGE_KEY, normalizedTheme);

    const lightRadio = document.getElementById("themeLight");
    const darkRadio = document.getElementById("themeDark");

    if (lightRadio) lightRadio.checked = normalizedTheme === "light";
    if (darkRadio) darkRadio.checked = normalizedTheme === "dark";
}

// Mostra uma view e esconde as restantes.
function showView(viewName, activeSidebarLink = null) {
    const driveView = document.getElementById("driveView");
    const settingsView = document.getElementById("settingsView");

    const showSettings = viewName === "settings";

    driveView?.classList.toggle("d-none", showSettings);
    driveView?.classList.toggle("active-view", !showSettings);

    settingsView?.classList.toggle("d-none", !showSettings);
    settingsView?.classList.toggle("active-view", showSettings);

    const activeLink = activeSidebarLink || (showSettings ? "settings" : "drive");
    setSidebarActiveLink(activeLink);
}

// Ativa a view da Drive.
function showDriveView() {
    showView("drive", "drive");
    window.loadDriveFolders?.("root");
}

// Ativa a view inicial com todos os ficheiros.
function showHomeView() {
    showView("drive", "home");
    window.loadHomeFiles?.();
}

// Ativa a view de definições.
function showSettingsView() {
    showView("settings", "settings");
    refreshMfaSettings();
}

// Mostra mensagens na secção de definições.
function settingsAlert(message, type = "info") {
    const container = document.getElementById("mfaSettingsAlert");
    if (!container) return;

    container.innerHTML = `
        <div class="alert alert-${type} alert-dismissible fade show" role="alert">
            ${escapeHtmlLocal(message)}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Fechar"></button>
        </div>
    `;
}

// Escapa texto usado especificamente nas definições.
function escapeHtmlLocal(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Atualiza o estado visual do MFA nas definições.
function refreshMfaSettings() {
    const enabled = Boolean(window.currentUser?.mfa_enabled);
    const badge = document.getElementById("mfaStatusBadge");
    const confirmBtn = document.getElementById("confirmMfaToggleBtn");
    const recoveryBtn = document.getElementById("confirmMfaRecoveryToggleBtn");

    if (badge) {
        badge.textContent = enabled ? "Ativo" : "Inativo";
        badge.className = `badge align-self-start ${enabled ? "text-bg-success" : "text-bg-secondary"}`;
    }

    if (confirmBtn) {
        confirmBtn.textContent = enabled ? "Desativar MFA" : "Ativar MFA";
        confirmBtn.className = enabled ? "btn btn-danger w-100" : "btn btn-primary w-100";
    }

    if (recoveryBtn) {
        recoveryBtn.textContent = enabled ? "Desativar com recovery key" : "Ativar com recovery key";
    }
}

// Pede o envio de um código MFA por email.
async function requestMfaCode() {
    try {
        const response = await apiRequest("/users/mfa/request-toggle", "POST", {}, true);
        pendingMfaToggleChallengeId = response.challenge_id;

        const help = document.getElementById("mfaDevCodeHelp");
        if (help) {
            help.innerHTML = response.dev_mfa_code
                ? `Código MFA: <strong>${escapeHtmlLocal(response.dev_mfa_code)}</strong>`
                : "Código enviado por email. Consulte a caixa de entrada.";
        }

        settingsAlert("Código MFA enviado por email.", "info");
    } catch (error) {
        console.error(error);
        settingsAlert(`Erro ao gerar código MFA: ${error.message}`, "danger");
    }
}

// Ativa ou desativa MFA usando o código recebido por email.
async function confirmMfaToggleWithCode() {
    const code = document.getElementById("mfaCodeInput")?.value.trim();
    const enable = !Boolean(window.currentUser?.mfa_enabled);

    if (!pendingMfaToggleChallengeId || !code) {
        settingsAlert("Primeiro gere um código MFA e introduza-o no campo Código.", "warning");
        return;
    }

    try {
        const response = await apiRequest("/users/mfa/toggle", "POST", {
            enable,
            challenge_id: pendingMfaToggleChallengeId,
            code
        }, true);

        window.currentUser.mfa_enabled = response.mfa_enabled;
        pendingMfaToggleChallengeId = null;
        document.getElementById("mfaCodeInput").value = "";
        document.getElementById("mfaDevCodeHelp").innerHTML = "";
        refreshMfaSettings();
        settingsAlert(response.message, "success");
    } catch (error) {
        console.error(error);
        settingsAlert(`Erro ao alterar MFA: ${error.message}`, "danger");
    }
}

// Ativa ou desativa MFA usando a recovery key.
async function confirmMfaToggleWithRecoveryKey() {
    const recoveryKey = document.getElementById("mfaRecoveryKeyInput")?.value.trim();
    const enable = !Boolean(window.currentUser?.mfa_enabled);

    if (!recoveryKey) {
        settingsAlert("Introduza a recovery key.", "warning");
        return;
    }

    try {
        const recoveryKeyHash = await recoveryKeyHashForServer(recoveryKey);
        const response = await apiRequest("/users/mfa/toggle", "POST", {
            enable,
            recovery_key_hash: recoveryKeyHash
        }, true);

        window.currentUser.mfa_enabled = response.mfa_enabled;
        document.getElementById("mfaRecoveryKeyInput").value = "";
        refreshMfaSettings();
        settingsAlert(response.message, "success");
    } catch (error) {
        console.error(error);
        settingsAlert(`Erro ao alterar MFA com recovery key: ${error.message}`, "danger");
    }
}

// Inicializa tema, navegação e eventos da página principal.
function initThemeSettings() {
    applyTheme(getSavedTheme());

    document.getElementById("themeLight")?.addEventListener("change", () => applyTheme("light"));
    document.getElementById("themeDark")?.addEventListener("change", () => applyTheme("dark"));

    document.getElementById("requestMfaCodeBtn")?.addEventListener("click", requestMfaCode);
    document.getElementById("confirmMfaToggleBtn")?.addEventListener("click", confirmMfaToggleWithCode);
    document.getElementById("confirmMfaRecoveryToggleBtn")?.addEventListener("click", confirmMfaToggleWithRecoveryKey);

    Promise.resolve(window.sidebarLoaded).then(() => setSidebarActiveLink("home"));
    refreshMfaSettings();
}

window.applyTheme = applyTheme;
window.setSidebarActiveLink = setSidebarActiveLink;
window.showDriveView = showDriveView;
window.showHomeView = showHomeView;
window.showSettingsView = showSettingsView;
window.refreshMfaSettings = refreshMfaSettings;

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initThemeSettings);
} else {
    initThemeSettings();
}
