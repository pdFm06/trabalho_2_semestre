/**
 * layout.js — Carregamento dinâmico da sidebar + toggle mobile
 *
 * Faz fetch do fragmento HTML da sidebar (layout/layout_sidebar.html)
 * e injeta-o no placeholder #sidebar-container da página.
 *
 * Expõe window.sidebarLoaded (Promise) para que auth_guard.js
 * possa aguardar que os elementos da sidebar estejam no DOM.
 *
 * Expõe window.toggleSidebar() para o botão hamburger em mobile.
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

/**
 * Abre/fecha a sidebar em mobile.
 * Em desktop não tem efeito porque a sidebar está sempre visível via CSS.
 */
window.toggleSidebar = function () {
    const sidebar  = document.querySelector(".sidebar");
    const overlay  = document.getElementById("sidebarOverlay");
    if (!sidebar) return;

    const isOpen = sidebar.classList.toggle("sidebar-open");
    if (overlay) overlay.classList.toggle("show", isOpen);
};