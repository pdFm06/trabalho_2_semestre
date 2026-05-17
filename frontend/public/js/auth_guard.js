document.addEventListener("DOMContentLoaded", async () => {
    const token = getAccessToken();

    if (!token) {
        window.location.href = "./auth/login.html";
        return;
    }

    // Aguardar que a sidebar esteja injetada no DOM antes de procurar
    // os elementos #currentUserEmail e #logoutButton.
    // Se layout.js não estiver presente (página sem sidebar), a Promise
    // é undefined e o await resolve imediatamente — sem quebrar nada.
    await window.sidebarLoaded;

    try {
        const user = await apiRequest("/users/me", "GET", null, true);
        const emailElement = document.getElementById("currentUserEmail");

        if (emailElement) {
            emailElement.textContent = user.email;
        }

        // Guardar dados do utilizador globalmente para uso noutros scripts.
        window.currentUser = user;

        // Atualizar barra de progresso do espaço usado na sidebar.
        updateStorageBar(user.storage_used ?? 0, user.storage_quota ?? 1_073_741_824);
    } catch (error) {
        console.error(error);
        clearAccessToken();
        window.location.href = "./auth/login.html";
    }

    const logoutButton = document.getElementById("logoutButton");
    if (logoutButton) {
        logoutButton.addEventListener("click", () => {
            clearAccessToken();
            window.cloudCryptoState = { privateKey: null, publicKey: null };
            window.location.href = "./auth/login.html";
        });
    }
});
/**
 * Atualiza a barra de progresso do espaço na sidebar.
 * Também é exportada para poder ser chamada após upload/delete.
 */
function updateStorageBar(used, quota) {
    const bar  = document.getElementById("storageProgressBar");
    const text = document.getElementById("storageUsedText");

    if (!bar && !text) return;

    const pct = quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0;

    if (bar) {
        bar.style.width = pct + "%";
        bar.setAttribute("aria-valuenow", pct);
        // Mudar cor conforme ocupação: vermelho > 90 %, amarelo > 70 %
        bar.className = "progress-bar " + (
            pct > 90 ? "bg-danger" :
            pct > 70 ? "bg-warning" :
            "barra_espaco"
        );
    }

    if (text) {
        text.textContent = formatStorageBytes(used) + " / " + formatStorageBytes(quota);
    }
}

function formatStorageBytes(bytes) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
    return (bytes / Math.pow(k, i)).toFixed(1).replace(".0", "") + " " + sizes[i];
}

window.updateStorageBar = updateStorageBar;