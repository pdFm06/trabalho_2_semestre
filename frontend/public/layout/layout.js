/**
 * layout.js — Carregamento dinâmico da sidebar
 *
 * Faz fetch do fragmento HTML da sidebar (layout/layout_sidebar.html)
 * e injeta-o no placeholder #sidebar-container da página.
 *
 * Expõe window.sidebarLoaded (Promise) para que auth_guard.js
 * possa aguardar que os elementos da sidebar (#currentUserEmail,
 * #logoutButton) estejam no DOM antes de os usar.
 */
window.sidebarLoaded = (async function loadSidebar() {
    const container = document.getElementById("sidebar-container");
    if (!container) return;

    try {
        const response = await fetch("./layout/layout_sidebar.html");
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        container.innerHTML = await response.text();
    } catch (error) {
        console.error("Erro ao carregar a sidebar:", error);
    }
})();