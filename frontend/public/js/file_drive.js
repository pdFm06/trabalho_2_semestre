const filesGrid = document.getElementById("filesGrid");
const fileSearchInput = document.getElementById("fileSearchInput");
const folderBreadcrumb = document.getElementById("folderBreadcrumb");
const createFolderBtn = document.getElementById("createFolderBtn");
const addFileBtn = document.getElementById("addFileBtn");
const driveTitle = document.getElementById("driveTitle");

const folderModalElement = document.getElementById("folderModal");
const folderCreateForm = document.getElementById("folderCreateForm");
const folderNameInput = document.getElementById("folderNameInput");
const folderCreateError = document.getElementById("folderCreateError");
const folderCreateLocation = document.getElementById("folderCreateLocation");

const moveFileModalElement = document.getElementById("moveFileModal");
const moveFileForm = document.getElementById("moveFileForm");
const moveFolderSelect = document.getElementById("moveFolderSelect");
const moveFileName = document.getElementById("moveFileName");
const moveFileError = document.getElementById("moveFileError");

let currentFiles = [];
let currentFolders = [];
let allFolders = [];
let currentBreadcrumbs = [];
let currentFolderId = null;
let selectedMoveFileId = null;
let isDownloading = false;
let currentView = "grid";
let showOnlyFavorites = false;
let currentTypeFilter = null; // null = todos; "pdf" | "video" | "image" | "zip" | "document" | "other"
let currentSection = "home";

// ─── Utilitários ────────────────────────────────────────────────────────────

function driveEscapeHTML(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function driveFormatFileSize(bytes) {
    const value = Number(bytes || 0);
    if (value === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.min(Math.floor(Math.log(value) / Math.log(k)), sizes.length - 1);
    return `${Math.round((value / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`;
}

function driveFormatDate(value) {
    if (!value) return "Data desconhecida";
    try {
        return new Intl.DateTimeFormat("pt-PT", {
            dateStyle: "short",
            timeStyle: "short"
        }).format(new Date(value));
    } catch (_) {
        return value;
    }
}

function getFileIcon(filename) {
    const lower = String(filename || "").toLowerCase();
    if (lower.endsWith(".mp4") || lower.endsWith(".mov") || lower.endsWith(".avi") || lower.endsWith(".mkv")) {
        return "./img/main_page/video.png";
    }
    if (lower.endsWith(".pdf")) {
        return "./img/main_page/pdf.png";
    }
    return "./img/main_page/download.png";
}

/**
 * Categoriza um ficheiro pelo seu tipo para o filtro "Tipo".
 * Devolve: "pdf" | "video" | "image" | "zip" | "document" | "other"
 */
function getFileTypeCategory(filename) {
    const lower = String(filename || "").toLowerCase();
    if (lower.endsWith(".pdf")) return "pdf";
    if ([".mp4", ".mov", ".avi", ".mkv", ".webm"].some((ext) => lower.endsWith(ext))) return "video";
    if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp"].some((ext) => lower.endsWith(ext))) return "image";
    if ([".zip", ".rar", ".7z", ".tar", ".gz", ".bz2"].some((ext) => lower.endsWith(ext))) return "zip";
    if ([".doc", ".docx", ".txt", ".odt", ".rtf", ".ppt", ".pptx", ".xls", ".xlsx"].some((ext) => lower.endsWith(ext))) return "document";
    return "other";
}

function getCurrentFolderId() {
    // Uploads feitos a partir do Início vão para a raiz.
    return currentSection === "drive" ? currentFolderId : null;
}

function getCurrentFolderName() {
    if (currentFolderId === null) return "Drive";
    const fromBreadcrumbs = currentBreadcrumbs.find((f) => Number(f.id) === Number(currentFolderId));
    return fromBreadcrumbs?.name || "Pasta";
}

function normalizeFolderId(folderId) {
    if (folderId === undefined || folderId === null || folderId === "root" || folderId === "") return null;
    return Number(folderId);
}

// ─── UI comum ────────────────────────────────────────────────────────────────

function setMainControlsForSection() {
    const isDrive = currentSection === "drive";

    // A criação de pastas só existe na Drive.
    if (createFolderBtn) createFolderBtn.classList.toggle("d-none", !isDrive);

    // O upload existe no Início e na Drive.
    // No Início, o upload vai para a raiz.
    // Na Drive, o upload vai para a pasta atualmente aberta.
    if (addFileBtn) addFileBtn.classList.remove("d-none");

    if (fileSearchInput) {
        fileSearchInput.placeholder = isDrive
            ? "Pesquisar ficheiros e pastas nesta localização..."
            : "Pesquisar ficheiros...";
    }

    if (folderBreadcrumb) {
        folderBreadcrumb.classList.toggle("d-none", !isDrive);
    }
}

function renderBreadcrumbs() {
    if (!folderBreadcrumb) return;

    const rootActive = currentFolderId === null;
    const rootClass = rootActive ? "text-muted text-decoration-none" : "text-primary text-decoration-none";

    let html = `<a href="#" class="${rootClass}" data-folder-open="root">Drive</a>`;

    for (const folder of currentBreadcrumbs) {
        const isActive = Number(folder.id) === Number(currentFolderId);
        const cls = isActive ? "text-muted text-decoration-none" : "text-primary text-decoration-none";
        html += ` <span class="text-muted">/</span> <a href="#" class="${cls}" data-folder-open="${folder.id}">${driveEscapeHTML(folder.name)}</a>`;
    }

    folderBreadcrumb.innerHTML = html;
}

function updateHeader() {
    setMainControlsForSection();

    if (currentSection === "home") {
        if (driveTitle) driveTitle.textContent = "Todos os ficheiros";
        if (folderBreadcrumb) folderBreadcrumb.innerHTML = "";
        if (folderCreateLocation) folderCreateLocation.textContent = "A nova pasta será criada na raiz da Drive.";
        return;
    }

    renderBreadcrumbs();
    if (driveTitle) {
        driveTitle.textContent = currentFolderId === null ? "Drive" : getCurrentFolderName();
    }
    if (folderCreateLocation) {
        folderCreateLocation.textContent = currentFolderId === null
            ? "A nova pasta será criada na raiz da Drive."
            : `A nova pasta será criada dentro de “${getCurrentFolderName()}”.`;
    }
}

async function refreshStorageBar() {
    try {
        const allFilesForStorage = await apiRequest("/files", "GET", null, true);
        const totalUsed = (allFilesForStorage || []).reduce((sum, f) => sum + (f.file_size || 0), 0);
        if (window.currentUser) {
            window.currentUser.storage_used = totalUsed;
            window.updateStorageBar?.(totalUsed, window.currentUser.storage_quota ?? 1_073_741_824);
        }
    } catch (error) {
        console.warn("Não foi possível atualizar a barra de espaço.", error);
    }
}

// ─── Pastas ─────────────────────────────────────────────────────────────────

async function loadAllFolders() {
    allFolders = await apiRequest("/folders", "GET", null, true) || [];
}

function renderFolderCards(folders = currentFolders) {
    return folders.map((folder) => `
        <div class="col-12 col-sm-6 col-md-4 col-lg-3 mb-4">
            <div class="caixa folder-card h-100" data-folder-id="${folder.id}"
                 data-drop-folder-id="${folder.id}">
                <button type="button" class="folder-open-btn w-100 text-start"
                        data-open-folder-id="${folder.id}"
                        title="Abrir ${driveEscapeHTML(folder.name)}">
                    <div class="folder-icon" aria-hidden="true">📁</div>
                    <div class="folder-name text-truncate">${driveEscapeHTML(folder.name)}</div>
                    <div class="small text-muted mt-1">Pasta</div>
                </button>
                <div class="px-3 pb-3 d-flex gap-2">
                    <button type="button" class="btn btn-sm btn-outline-primary flex-fill"
                            data-open-folder-id="${folder.id}">Abrir</button>
                    <button type="button" class="btn btn-sm btn-outline-danger"
                            data-delete-folder-id="${folder.id}" title="Eliminar pasta vazia">🗑</button>
                </div>
            </div>
        </div>
    `).join("");
}

function renderFolderRows(folders = currentFolders) {
    return folders.map((folder) => `
        <tr data-folder-id="${folder.id}">
            <td>
                <button type="button" class="folder-row-btn" data-open-folder-id="${folder.id}">
                    <span aria-hidden="true" class="me-2">📁</span>
                    <span class="text-truncate" title="${driveEscapeHTML(folder.name)}">${driveEscapeHTML(folder.name)}</span>
                </button>
            </td>
            <td class="text-muted small">Pasta</td>
            <td class="text-muted small">${driveFormatDate(folder.created_at)}</td>
            <td>
                <div class="d-flex gap-1 justify-content-end">
                    <button type="button" class="btn btn-sm btn-outline-primary"
                            data-open-folder-id="${folder.id}">Abrir</button>
                    <button type="button" class="btn btn-sm btn-outline-danger"
                            data-delete-folder-id="${folder.id}">Eliminar</button>
                </div>
            </td>
        </tr>
    `).join("");
}

function renderDriveContents(folders = currentFolders, files = currentFiles) {
    if (!filesGrid) return;
    updateHeader();

    const hasFolders = folders.length > 0;
    const hasFiles = files.length > 0;

    if (!hasFolders && !hasFiles) {
        filesGrid.className = "row";
        filesGrid.innerHTML = `
            <div class="col-12">
                <div class="alert alert-light border text-muted mb-0">
                    Esta localização está vazia. Usa “Nova pasta” para criar uma pasta ou “Adicionar” para carregar ficheiros aqui.
                </div>
            </div>
        `;
        return;
    }

    if (currentView === "list") {
        const folderRows = renderFolderRows(folders);
        const fileRows = renderFileRows(files);
        filesGrid.className = "col-12";
        filesGrid.innerHTML = `
            <table class="table table-hover align-middle mb-0">
                <thead class="table-light">
                    <tr>
                        <th scope="col">Nome</th>
                        <th scope="col" style="width:120px">Tipo/Tamanho</th>
                        <th scope="col" style="width:180px">Data</th>
                        <th scope="col" style="width:280px"></th>
                    </tr>
                </thead>
                <tbody>${folderRows}${fileRows}</tbody>
            </table>
        `;
        return;
    }

    filesGrid.className = "row";

    const foldersHtml = hasFolders ? `
        <div class="col-12 mb-2">
            <h5 class="mb-3">Pastas</h5>
        </div>
        ${renderFolderCards(folders)}
    ` : "";

    const filesHtml = hasFiles ? `
        <div class="col-12 mt-2 mb-2">
            <h5 class="mb-3">Ficheiros</h5>
        </div>
        ${renderFileCards(files)}
    ` : "";

    filesGrid.innerHTML = `${foldersHtml}${filesHtml}`;
}

// Alias mantido para compatibilidade com código antigo.
function renderDriveFolders(folders = currentFolders) {
    renderDriveContents(folders, currentFiles);
}

// ─── Ficheiros ──────────────────────────────────────────────────────────────

function renderFileCards(files = currentFiles) {
    return files.map((file) => {
        const originalSize = file.original_file_size ?? file.file_size;
        const favClass = file.is_favorite ? "btn-warning" : "btn-outline-warning";
        const favTitle = file.is_favorite ? "Remover dos favoritos" : "Adicionar aos favoritos";
        const favIcon  = file.is_favorite ? "⭐" : "☆";
        return `
            <div class="col-12 col-sm-6 col-md-4 col-lg-3 mb-4">
                <div class="caixa file-card h-100" data-file-id="${file.id}"
                     draggable="true" data-drag-file-id="${file.id}">
                    <div class="nome_ficheiro">
                        <p class="mb-0 fw-semibold text-truncate" title="${driveEscapeHTML(file.filename)}">
                            ${driveEscapeHTML(file.filename)}
                        </p>
                    </div>
                    <img class="img_ficheiro" src="${getFileIcon(file.filename)}" alt="Ficheiro">
                    <div class="px-3 pb-3 small text-muted">
                        <div>${driveFormatFileSize(originalSize)}</div>
                        <div>${driveFormatDate(file.created_at)}</div>
                    </div>
                    <div class="px-3 pb-3 d-flex gap-2 flex-wrap">
                        <button type="button" class="btn btn-sm btn-primary flex-fill"
                                data-download-file-id="${file.id}">Download</button>
                        <button type="button" class="btn btn-sm btn-outline-secondary"
                                data-move-file-id="${file.id}" title="Mover para pasta">Mover</button>
                        <button type="button" class="btn btn-sm ${favClass}"
                                data-favorite-file-id="${file.id}" title="${favTitle}">${favIcon}</button>
                        <button type="button" class="btn btn-sm btn-danger"
                                data-delete-file-id="${file.id}" title="Eliminar">🗑</button>
                    </div>
                </div>
            </div>
        `;
    }).join("");
}

function renderFileRows(files = currentFiles) {
    return files.map((file) => {
        const originalSize = file.original_file_size ?? file.file_size;
        const favClass = file.is_favorite ? "btn-warning" : "btn-outline-warning";
        const favTitle = file.is_favorite ? "Remover dos favoritos" : "Adicionar aos favoritos";
        const favIcon  = file.is_favorite ? "⭐" : "☆";
        return `
            <tr data-file-id="${file.id}">
                <td>
                    <div class="d-flex align-items-center gap-2">
                        <img src="${getFileIcon(file.filename)}" alt="Ficheiro"
                             style="width:28px;height:28px;object-fit:contain;flex-shrink:0;">
                        <span class="text-truncate" style="max-width:360px" title="${driveEscapeHTML(file.filename)}">
                            ${driveEscapeHTML(file.filename)}
                        </span>
                    </div>
                </td>
                <td class="text-muted small">${driveFormatFileSize(originalSize)}</td>
                <td class="text-muted small">${driveFormatDate(file.created_at)}</td>
                <td>
                    <div class="d-flex gap-1 justify-content-end">
                        <button type="button" class="btn btn-sm btn-primary"
                                data-download-file-id="${file.id}">Download</button>
                        <button type="button" class="btn btn-sm btn-outline-secondary"
                                data-move-file-id="${file.id}">Mover</button>
                        <button type="button" class="btn btn-sm ${favClass}"
                                data-favorite-file-id="${file.id}" title="${favTitle}">${favIcon}</button>
                        <button type="button" class="btn btn-sm btn-danger"
                                data-delete-file-id="${file.id}" title="Eliminar">🗑</button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}

function renderHomeFiles(files = currentFiles) {
    if (!filesGrid) return;
    updateHeader();

    if (!files.length) {
        const msg = showOnlyFavorites
            ? "Ainda não há ficheiros marcados como favoritos."
            : "Ainda não existem ficheiros. Usa “Adicionar” para carregar ficheiros.";
        filesGrid.className = "row";
        filesGrid.innerHTML = `
            <div class="col-12">
                <div class="alert alert-light border text-muted mb-0">${msg}</div>
            </div>
        `;
        return;
    }

    if (currentView === "list") {
        filesGrid.className = "col-12";
        filesGrid.innerHTML = `
            <table class="table table-hover align-middle mb-0">
                <thead class="table-light">
                    <tr>
                        <th scope="col">Nome</th>
                        <th scope="col" style="width:120px">Tamanho</th>
                        <th scope="col" style="width:180px">Data</th>
                        <th scope="col" style="width:280px"></th>
                    </tr>
                </thead>
                <tbody>${renderFileRows(files)}</tbody>
            </table>
        `;
        return;
    }

    filesGrid.className = "row";
    filesGrid.innerHTML = renderFileCards(files);
}

// ─── Filtros ────────────────────────────────────────────────────────────────

function filterCurrentView() {
    const query = String(fileSearchInput?.value || "").trim().toLowerCase();

    // Se a pesquisa começa com "." trata-a como filtro de extensão.
    // Ex: ".pdf" mostra só PDFs; ".mp4" mostra só vídeos; ".zip" só ZIPs.
    const isExtSearch = query.startsWith(".");

    if (currentSection === "drive") {
        let filteredFolders = currentFolders;
        let filteredFiles   = showOnlyFavorites
            ? currentFiles.filter((f) => f.is_favorite)
            : currentFiles;

        if (currentTypeFilter) {
            filteredFiles = filteredFiles.filter((f) => getFileTypeCategory(f.filename) === currentTypeFilter);
        }

        if (query) {
            if (isExtSearch) {
                filteredFiles = filteredFiles.filter((f) =>
                    String(f.filename || "").toLowerCase().endsWith(query)
                );
            } else {
                filteredFolders = filteredFolders.filter((f) => String(f.name     || "").toLowerCase().includes(query));
                filteredFiles   = filteredFiles.filter((f)   => String(f.filename || "").toLowerCase().includes(query));
            }
        }

        renderDriveContents(filteredFolders, filteredFiles);
        return;
    }

    let filteredFiles = showOnlyFavorites
        ? currentFiles.filter((f) => f.is_favorite)
        : currentFiles;

    if (currentTypeFilter) {
        filteredFiles = filteredFiles.filter((f) => getFileTypeCategory(f.filename) === currentTypeFilter);
    }

    if (query) {
        if (isExtSearch) {
            filteredFiles = filteredFiles.filter((f) =>
                String(f.filename || "").toLowerCase().endsWith(query)
            );
        } else {
            filteredFiles = filteredFiles.filter((f) =>
                String(f.filename || "").toLowerCase().includes(query)
            );
        }
    }

    renderHomeFiles(filteredFiles);
}

// ─── Carregamento de dados ──────────────────────────────────────────────────

async function loadHomeFiles() {
    if (!filesGrid) return;
    currentSection = "home";
    currentFolderId = null;
    currentFolders = [];
    currentBreadcrumbs = [];
    window.setSidebarActiveLink?.("home");
    updateHeader();

    filesGrid.className = "row";
    filesGrid.innerHTML = `
        <div class="col-12">
            <div class="alert alert-light border text-muted mb-0">A carregar ficheiros...</div>
        </div>
    `;

    try {
        const [files] = await Promise.all([
            apiRequest("/files", "GET", null, true),
            loadAllFolders()
        ]);
        currentFiles = files || [];
        filterCurrentView();
        await refreshStorageBar();
    } catch (error) {
        console.error(error);
        filesGrid.innerHTML = `
            <div class="col-12">
                <div class="alert alert-danger mb-0">Erro ao carregar ficheiros: ${driveEscapeHTML(error.message)}</div>
            </div>
        `;
    }
}

async function loadDriveFolders(folderId = currentFolderId) {
    if (!filesGrid) return;
    currentSection = "drive";
    currentFolderId = normalizeFolderId(folderId);
    window.setSidebarActiveLink?.("drive");
    updateHeader();

    filesGrid.className = "row";
    filesGrid.innerHTML = `
        <div class="col-12">
            <div class="alert alert-light border text-muted mb-0">A carregar Drive...</div>
        </div>
    `;

    try {
        const qs = currentFolderId === null ? "" : `?folder_id=${encodeURIComponent(currentFolderId)}`;
        const data = await apiRequest(`/drive${qs}`, "GET", null, true);

        currentFolders = data.folders || [];
        currentFiles = data.files || [];
        currentBreadcrumbs = data.breadcrumbs || [];
        await loadAllFolders();
        filterCurrentView();
        await refreshStorageBar();
    } catch (error) {
        console.error(error);
        filesGrid.innerHTML = `
            <div class="col-12">
                <div class="alert alert-danger mb-0">Erro ao carregar Drive: ${driveEscapeHTML(error.message)}</div>
            </div>
        `;
    }
}

async function loadUserFiles(folderId = null) {
    // Mantém compatibilidade com file_upload.js e chamadas antigas.
    if (currentSection === "drive") {
        return loadDriveFolders(folderId ?? currentFolderId);
    }
    return loadHomeFiles();
}

async function openFolder(folderId) {
    await loadDriveFolders(normalizeFolderId(folderId));
}

// ─── Criar pasta ────────────────────────────────────────────────────────────

function resetFolderModal() {
    if (folderNameInput) folderNameInput.value = "";
    if (folderCreateError) {
        folderCreateError.textContent = "";
        folderCreateError.classList.add("d-none");
    }
    updateHeader();
}

async function createFolderInCurrentFolder(event) {
    event?.preventDefault?.();
    const cleaned = String(folderNameInput?.value || "").trim();

    if (!cleaned) {
        if (folderCreateError) {
            folderCreateError.textContent = "O nome da pasta não pode estar vazio.";
            folderCreateError.classList.remove("d-none");
        }
        return;
    }

    try {
        await apiRequest("/folders", "POST", {
            name: cleaned,
            parent_id: currentFolderId
        }, true);

        showAlert?.(`Pasta “${cleaned}” criada com sucesso.`, "success");
        bootstrap.Modal.getInstance(folderModalElement)?.hide();
        resetFolderModal();
        await loadDriveFolders(currentFolderId);
    } catch (error) {
        console.error(error);
        if (folderCreateError) {
            folderCreateError.textContent = error.message;
            folderCreateError.classList.remove("d-none");
        }
    }
}

async function deleteFolder(folderId) {
    const folder = allFolders.find((item) => Number(item.id) === Number(folderId));
    const folderName = folder?.name || `pasta #${folderId}`;

    if (!confirm(`Tem a certeza que quer eliminar a pasta "${folderName}"?\n\nSó é possível eliminar pastas vazias.`)) return;

    try {
        await apiRequest(`/folders/${encodeURIComponent(folderId)}`, "DELETE", null, true);
        showAlert?.(`Pasta “${folderName}” eliminada com sucesso.`, "success");
        if (Number(currentFolderId) === Number(folderId)) currentFolderId = null;
        await loadDriveFolders(currentFolderId);
    } catch (error) {
        console.error(error);
        showAlert?.(`Erro ao eliminar pasta: ${error.message}`, "danger", false);
    }
}

// ─── Mover ficheiros ────────────────────────────────────────────────────────

function getFolderPathLabel(folder) {
    const parts = [folder.name];
    let parentId = folder.parent_id;
    const seen = new Set([folder.id]);

    while (parentId !== null && parentId !== undefined && !seen.has(parentId)) {
        seen.add(parentId);
        const parent = allFolders.find((f) => Number(f.id) === Number(parentId));
        if (!parent) break;
        parts.unshift(parent.name);
        parentId = parent.parent_id;
    }

    return `Drive / ${parts.join(" / ")}`;
}

function populateMoveFolderSelect(file) {
    if (!moveFolderSelect) return;

    const options = [
        `<option value="root">Drive / Raiz</option>`,
        ...allFolders.map((folder) => {
            const selected = Number(file.folder_id) === Number(folder.id) ? "selected" : "";
            return `<option value="${folder.id}" ${selected}>${driveEscapeHTML(getFolderPathLabel(folder))}</option>`;
        })
    ];

    if (file.folder_id === null || file.folder_id === undefined) {
        options[0] = `<option value="root" selected>Drive / Raiz</option>`;
    }

    moveFolderSelect.innerHTML = options.join("");
}

async function openMoveFileModal(fileId) {
    const file = currentFiles.find((item) => Number(item.id) === Number(fileId));
    if (!file) return;

    selectedMoveFileId = Number(fileId);
    await loadAllFolders();
    populateMoveFolderSelect(file);

    if (moveFileName) moveFileName.textContent = `Ficheiro: ${file.filename}`;
    if (moveFileError) {
        moveFileError.textContent = "";
        moveFileError.classList.add("d-none");
    }

    bootstrap.Modal.getOrCreateInstance(moveFileModalElement).show();
}

async function submitMoveFile(event) {
    event?.preventDefault?.();
    if (!selectedMoveFileId) return;

    const rawFolderId = moveFolderSelect?.value || "root";
    const targetFolderId = normalizeFolderId(rawFolderId);

    try {
        await apiRequest(`/files/${encodeURIComponent(selectedMoveFileId)}/move`, "PATCH", {
            folder_id: targetFolderId
        }, true);

        bootstrap.Modal.getInstance(moveFileModalElement)?.hide();
        showAlert?.("Ficheiro movido com sucesso.", "success");

        if (currentSection === "drive") {
            await loadDriveFolders(currentFolderId);
        } else {
            await loadHomeFiles();
        }
    } catch (error) {
        console.error(error);
        if (moveFileError) {
            moveFileError.textContent = error.message;
            moveFileError.classList.remove("d-none");
        }
    }
}

// ─── Modal de password para download ────────────────────────────────────────

function ensurePasswordModal() {
    let modalElement = document.getElementById("privateKeyPasswordModal");
    if (modalElement) return modalElement;

    const wrapper = document.createElement("div");
    wrapper.innerHTML = `
        <div class="modal fade" id="privateKeyPasswordModal" tabindex="-1" aria-labelledby="privateKeyPasswordModalLabel" aria-hidden="true">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <form id="privateKeyPasswordForm">
                        <div class="modal-header">
                            <h1 class="modal-title fs-5" id="privateKeyPasswordModalLabel">Confirmar password</h1>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
                        </div>
                        <div class="modal-body">
                            <p class="small text-muted">
                                A chave privada só fica em memória. Introduz a tua password para a carregar novamente e decifrar o ficheiro.
                            </p>
                            <input type="password" id="privateKeyPasswordInput" class="form-control" autocomplete="current-password" required>
                            <div id="privateKeyPasswordError" class="text-danger small mt-2 d-none"></div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                            <button type="submit" class="btn btn-primary">Continuar</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(wrapper.firstElementChild);
    return document.getElementById("privateKeyPasswordModal");
}

function askPasswordForPrivateKey() {
    const modalElement = ensurePasswordModal();
    const modal = bootstrap.Modal.getOrCreateInstance(modalElement);
    const form = document.getElementById("privateKeyPasswordForm");
    const input = document.getElementById("privateKeyPasswordInput");
    const errorElement = document.getElementById("privateKeyPasswordError");

    input.value = "";
    errorElement.classList.add("d-none");
    errorElement.textContent = "";

    return new Promise((resolve, reject) => {
        let settled = false;

        const cleanup = () => {
            form.removeEventListener("submit", onSubmit);
            modalElement.removeEventListener("hidden.bs.modal", onHidden);
        };

        const onHidden = () => {
            if (!settled) {
                settled = true;
                cleanup();
                reject(new Error("Operação cancelada."));
            }
        };

        const onSubmit = async (event) => {
            event.preventDefault();
            errorElement.classList.add("d-none");
            errorElement.textContent = "";

            try {
                const password = input.value;
                const userCrypto = await apiRequest("/users/me", "GET", null, true);
                const privateKey = await decryptUserPrivateKey(password, userCrypto);
                const publicKey = await importUserPublicKey(userCrypto.public_key);

                window.cloudCryptoState = window.cloudCryptoState || {};
                window.cloudCryptoState.privateKey = privateKey;
                window.cloudCryptoState.publicKey = publicKey;

                settled = true;
                cleanup();
                modal.hide();
                resolve();
            } catch (error) {
                console.error(error);
                errorElement.textContent = "Password inválida ou não foi possível carregar a chave privada.";
                errorElement.classList.remove("d-none");
            } finally {
                input.value = "";
            }
        };

        form.addEventListener("submit", onSubmit);
        modalElement.addEventListener("hidden.bs.modal", onHidden);
        modal.show();
        setTimeout(() => input.focus(), 250);
    });
}

async function ensurePrivateKeyLoadedForDownload() {
    if (window.cloudCryptoState?.privateKey) return;
    await askPasswordForPrivateKey();
}

// ─── Download ───────────────────────────────────────────────────────────────

async function fetchEncryptedFile(fileId) {
    const token = getAccessToken();
    if (!token) throw new Error("Sessão expirada. Faça login novamente.");

    const response = await fetch(`${API_BASE_URL}/download/${encodeURIComponent(fileId)}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.detail || "Erro ao descarregar ficheiro cifrado do backend.");
    }

    return await response.blob();
}

async function fetchEncryptedFileKey(fileId) {
    const token = getAccessToken();
    if (!token) throw new Error("Sessão expirada. Faça login novamente.");

    const response = await fetch(`${window.KEYSERVER_BASE_URL}/keys/${encodeURIComponent(fileId)}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` }
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.detail || "Erro ao obter chave cifrada no keyserver.");
    return data;
}

function triggerPlainFileDownload(arrayBuffer, filename) {
    const blob = new Blob([arrayBuffer]);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename || "ficheiro";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

async function downloadAndDecryptFile(fileId) {
    if (isDownloading) return;

    const file = currentFiles.find((item) => Number(item.id) === Number(fileId));
    if (!file) throw new Error("Ficheiro não encontrado na lista local.");
    if (!file.file_iv) throw new Error("O IV do ficheiro não está disponível. Não é possível decifrar.");

    try {
        isDownloading = true;
        setUploadStatus?.(`A preparar download de ${file.filename}...`);
        await ensurePrivateKeyLoadedForDownload();

        const [encryptedBlob, keyPayload] = await Promise.all([
            fetchEncryptedFile(file.id),
            fetchEncryptedFileKey(file.id)
        ]);

        setUploadStatus?.(`A decifrar ${file.filename}...`);
        const plainBuffer = await decryptDownloadedFile(
            encryptedBlob,
            keyPayload.encrypted_file_key,
            file.file_iv
        );

        triggerPlainFileDownload(plainBuffer, file.filename);
        showAlert?.(`Download de "${file.filename}" concluído.`, "success");
    } catch (error) {
        console.error(error);
        showAlert?.(`Erro no download: ${error.message}`, "danger", false);
    } finally {
        isDownloading = false;
        setUploadStatus?.("");
    }
}

// ─── Favorito ───────────────────────────────────────────────────────────────

async function toggleFavorite(fileId) {
    try {
        const updated = await apiRequest(`/files/${encodeURIComponent(fileId)}/favorite`, "PATCH", null, true);
        const idx = currentFiles.findIndex((f) => Number(f.id) === Number(fileId));
        if (idx !== -1) currentFiles[idx] = updated;
        filterCurrentView();
        const label = updated.is_favorite ? "adicionado aos" : "removido dos";
        showAlert?.(`"${updated.filename}" ${label} favoritos.`, "success");
    } catch (error) {
        console.error(error);
        showAlert?.(`Erro ao alterar favorito: ${error.message}`, "danger", false);
    }
}

// ─── Delete ─────────────────────────────────────────────────────────────────

async function deleteFile(fileId) {
    const file = currentFiles.find((item) => Number(item.id) === Number(fileId));
    const filename = file?.filename || `ficheiro #${fileId}`;

    if (!confirm(`Tem a certeza que quer eliminar "${filename}"?\n\nEsta ação é irreversível.`)) return;

    try {
        await apiRequest(`/delete?file_id=${encodeURIComponent(fileId)}`, "DELETE", null, true);
        currentFiles = currentFiles.filter((item) => Number(item.id) !== Number(fileId));
        filterCurrentView();

        if (window.currentUser && file) {
            window.currentUser.storage_used = Math.max(0, (window.currentUser.storage_used || 0) - (file.file_size || 0));
            window.updateStorageBar?.(window.currentUser.storage_used, window.currentUser.storage_quota ?? 1_073_741_824);
        }

        showAlert?.(`"${filename}" eliminado com sucesso.`, "success");
    } catch (error) {
        console.error(error);
        showAlert?.(`Erro ao eliminar: ${error.message}`, "danger", false);
    }
}

// ─── Drag & Drop — mover ficheiros para pastas ──────────────────────────────

filesGrid?.addEventListener("dragstart", (event) => {
    const card = event.target.closest("[data-drag-file-id]");
    if (!card) return;
    event.dataTransfer.setData("text/plain", card.dataset.dragFileId);
    event.dataTransfer.effectAllowed = "move";
    card.style.opacity = "0.5";
});

filesGrid?.addEventListener("dragend", (event) => {
    const card = event.target.closest("[data-drag-file-id]");
    if (card) card.style.opacity = "1";
});

filesGrid?.addEventListener("dragover", (event) => {
    const folderCard = event.target.closest("[data-drop-folder-id]");
    if (!folderCard) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    folderCard.style.outline = "2px solid #0d6efd";
    folderCard.style.background = "#e8f0fe";
});

filesGrid?.addEventListener("dragleave", (event) => {
    const folderCard = event.target.closest("[data-drop-folder-id]");
    if (!folderCard) return;
    // Só limpar se sair mesmo da pasta (não de um filho)
    if (!folderCard.contains(event.relatedTarget)) {
        folderCard.style.outline = "";
        folderCard.style.background = "";
    }
});

filesGrid?.addEventListener("drop", async (event) => {
    const folderCard = event.target.closest("[data-drop-folder-id]");
    if (!folderCard) return;
    event.preventDefault();
    folderCard.style.outline = "";
    folderCard.style.background = "";

    const fileId = event.dataTransfer.getData("text/plain");
    const folderId = normalizeFolderId(folderCard.dataset.dropFolderId);
    if (!fileId) return;

    const file = currentFiles.find((f) => Number(f.id) === Number(fileId));
    const folder = allFolders.find((f) => Number(f.id) === Number(folderId));
    const folderName = folder?.name || `pasta #${folderId}`;

    try {
        await apiRequest(`/files/${encodeURIComponent(fileId)}/move`, "PATCH", {
            folder_id: folderId
        }, true);

        showAlert?.(`"${driveEscapeHTML(file?.filename || fileId)}" movido para "${driveEscapeHTML(folderName)}".`, "success");

        if (currentSection === "drive") {
            await loadDriveFolders(currentFolderId);
        } else {
            await loadHomeFiles();
        }
    } catch (error) {
        console.error(error);
        showAlert?.(`Erro ao mover ficheiro: ${error.message}`, "danger", false);
    }
});

// ─── Drag & Drop no breadcrumb — mover ficheiros para pastas acima ──────────

folderBreadcrumb?.addEventListener("dragover", (event) => {
    const link = event.target.closest("[data-folder-open]");
    if (!link) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    link.style.outline = "2px solid #0d6efd";
    link.style.borderRadius = "4px";
});

folderBreadcrumb?.addEventListener("dragleave", (event) => {
    const link = event.target.closest("[data-folder-open]");
    if (link && !link.contains(event.relatedTarget)) {
        link.style.outline = "";
    }
});

folderBreadcrumb?.addEventListener("drop", async (event) => {
    const link = event.target.closest("[data-folder-open]");
    if (!link) return;
    event.preventDefault();
    link.style.outline = "";

    const fileId = event.dataTransfer.getData("text/plain");
    if (!fileId) return;

    const rawFolderId = link.dataset.folderOpen; // "root" ou ID numérico
    const targetFolderId = normalizeFolderId(rawFolderId);
    const file = currentFiles.find((f) => Number(f.id) === Number(fileId));
    const destName = targetFolderId === null ? "Drive (raiz)" : link.textContent.trim();

    try {
        await apiRequest(`/files/${encodeURIComponent(fileId)}/move`, "PATCH", {
            folder_id: targetFolderId
        }, true);

        showAlert?.(`"${driveEscapeHTML(file?.filename || fileId)}" movido para "${driveEscapeHTML(destName)}".`, "success");
        await loadDriveFolders(currentFolderId);
    } catch (error) {
        console.error(error);
        showAlert?.(`Erro ao mover ficheiro: ${error.message}`, "danger", false);
    }
});

// ─── Event listeners ────────────────────────────────────────────────────────

filesGrid?.addEventListener("click", (event) => {
    const openFolderBtn = event.target.closest("[data-open-folder-id]");
    if (openFolderBtn) { openFolder(openFolderBtn.dataset.openFolderId); return; }

    const deleteFolderBtn = event.target.closest("[data-delete-folder-id]");
    if (deleteFolderBtn) { deleteFolder(deleteFolderBtn.dataset.deleteFolderId); return; }

    const downloadBtn = event.target.closest("[data-download-file-id]");
    if (downloadBtn) { downloadAndDecryptFile(downloadBtn.dataset.downloadFileId); return; }

    const moveBtn = event.target.closest("[data-move-file-id]");
    if (moveBtn) { openMoveFileModal(moveBtn.dataset.moveFileId); return; }

    const favBtn = event.target.closest("[data-favorite-file-id]");
    if (favBtn) { toggleFavorite(favBtn.dataset.favoriteFileId); return; }

    const deleteBtn = event.target.closest("[data-delete-file-id]");
    if (deleteBtn) { deleteFile(deleteBtn.dataset.deleteFileId); return; }
});

folderBreadcrumb?.addEventListener("click", (event) => {
    const breadcrumbLink = event.target.closest("[data-folder-open]");
    if (breadcrumbLink) {
        event.preventDefault();
        openFolder(breadcrumbLink.dataset.folderOpen);
    }
});

folderModalElement?.addEventListener("show.bs.modal", resetFolderModal);
folderCreateForm?.addEventListener("submit", createFolderInCurrentFolder);
moveFileForm?.addEventListener("submit", submitMoveFile);
fileSearchInput?.addEventListener("input", filterCurrentView);

document.addEventListener("DOMContentLoaded", () => {
    loadHomeFiles();
});

// ─── Exports globais ────────────────────────────────────────────────────────

window.loadUserFiles = loadUserFiles;
window.loadHomeFiles = loadHomeFiles;
window.loadDriveFolders = loadDriveFolders;
window.downloadAndDecryptFile = downloadAndDecryptFile;
window.deleteFile = deleteFile;
window.toggleFavorite = toggleFavorite;
window.openFolder = openFolder;
window.getCurrentFolderId = getCurrentFolderId;
window.deleteFolder = deleteFolder;
window.openMoveFileModal = openMoveFileModal;

window.setView = function (mode) {
    if (mode !== "grid" && mode !== "list") return;
    currentView = mode;

    const btnGrid = document.getElementById("btnViewGrid");
    const btnList = document.getElementById("btnViewList");
    if (btnGrid && btnList) {
        btnGrid.className = mode === "grid" ? "btn btn-sm btn-secondary" : "btn btn-sm btn-outline-secondary";
        btnList.className = mode === "list" ? "btn btn-sm btn-secondary" : "btn btn-sm btn-outline-secondary";
    }
    filterCurrentView();
};

window.setFavoriteFilter = function (onlyFavorites) {
    showOnlyFavorites = !!onlyFavorites;
    filterCurrentView();
};

window.setTypeFilter = function (type) {
    // type: null | "pdf" | "image" | "video" | "zip" | "document"
    currentTypeFilter = type || null;

    // Actualizar o label do botão Tipo com o filtro activo.
    const labels = {
        null: "Tipo", pdf: "Tipo: PDF", image: "Tipo: Imagem",
        video: "Tipo: Vídeo", zip: "Tipo: ZIP", document: "Tipo: Documento"
    };
    const btn = document.getElementById("btnTipoLabel");
    if (btn) btn.textContent = labels[type] ?? "Tipo";

    filterCurrentView();
};