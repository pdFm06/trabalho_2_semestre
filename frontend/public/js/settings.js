const THEME_STORAGE_KEY = "app_theme";

function getSavedTheme() {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return saved === "dark" ? "dark" : "light";
}

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

function showDriveView() {
    showView("drive", "drive");
    window.loadDriveFolders?.("root");
}

function showHomeView() {
    showView("drive", "home");
    window.loadHomeFiles?.();
}

function showSettingsView() {
    showView("settings", "settings");
}

function initThemeSettings() {
    applyTheme(getSavedTheme());

    document.getElementById("themeLight")?.addEventListener("change", () => applyTheme("light"));
    document.getElementById("themeDark")?.addEventListener("change", () => applyTheme("dark"));

    // A sidebar é carregada dinamicamente, por isso marcamos o link ativo depois do fetch.
    Promise.resolve(window.sidebarLoaded).then(() => setSidebarActiveLink("home"));
}

window.applyTheme = applyTheme;
window.setSidebarActiveLink = setSidebarActiveLink;
window.showDriveView = showDriveView;
window.showHomeView = showHomeView;
window.showSettingsView = showSettingsView;

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initThemeSettings);
} else {
    initThemeSettings();
}
