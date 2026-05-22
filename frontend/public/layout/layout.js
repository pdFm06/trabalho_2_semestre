


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


window.toggleSidebar = function () {
    const sidebar  = document.querySelector(".sidebar");
    const overlay  = document.getElementById("sidebarOverlay");
    if (!sidebar) return;

    const isOpen = sidebar.classList.toggle("sidebar-open");
    if (overlay) overlay.classList.toggle("show", isOpen);
};