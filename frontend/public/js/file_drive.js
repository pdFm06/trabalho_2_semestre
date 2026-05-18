const filesGrid = document.getElementById("filesGrid");
const fileSearchInput = document.getElementById("fileSearchInput");
const folderBreadcrumb = document.getElementById("folderBreadcrumb");
const createFolderBtn = document.getElementById("createFolderBtn");
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

let sidebarFolderTree = null;
let currentFiles = [];
let currentFolders = [];       // subpastas da pasta atual, mantidas para compatibilidade
let allFolders = [];           // todas as pastas, usadas pela sidebar e pelo modal de mover
let currentBreadcrumbs = [];
let currentFolderId = null;
let selectedMoveFileId = null;
let isDownloading = false;
let currentView = "grid";       // "grid" | "list"
let showOnlyFavorites = false;  // filtro de favoritos

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

function getCurrentFolderId() {
    return currentFolderId;
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

// ─── Breadcrumbs ─────────────────────────────────────────────────────────────

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

function updateDriveHeader() {
    renderBreadcrumbs();
    if (driveTitle) {
        driveTitle.textContent = currentFolderId === null ? "Ficheiros na Drive" : `Ficheiros em ${getCurrentFolderName()}`;
    }
    if (folderCreateLocation) {
        folderCreateLocation.textContent = currentFolderId === null
            ? "A nova pasta será criada na raiz da Drive."
            : `A nova pasta será criada dentro de “${getCurrentFolderName()}”.`;
    }
}

// ─── Sidebar de pastas ───────────────────────────────────────────────────────

function buildFolderTree(parentId = null) {
    return allFolders
        .filter((folder) => {
            if (parentId === null) return folder.parent_id === null || folder.parent_id === undefined;
            return Number(folder.parent_id) === Number(parentId);
        })
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-PT"));
}

function renderFolderTreeNodes(parentId = null) {
    const children = buildFolderTree(parentId);
    if (!children.length) return "";

    return `
        <ul class="sidebar-folder-list">
            ${children.map((folder) => {
                const active = Number(folder.id) === Number(currentFolderId) ? "active" : "";
                const nested = renderFolderTreeNodes(folder.id);
                return `
                    <li class="sidebar-folder-item">
                        <button type="button" class="sidebar-folder-btn ${active}"
                                data-sidebar-folder-id="${folder.id}"
                                title="${driveEscapeHTML(folder.name)}">
                            <span aria-hidden="true">📁</span>
                            <span class="sidebar-folder-name">${driveEscapeHTML(folder.name)}</span>
                        </button>
                        ${nested}
                    </li>
                `;
            }).join("")}
        </ul>
    `;
}

function renderSidebarFolders() {
    sidebarFolderTree = sidebarFolderTree || document.getElementById("sidebarFolderTree");
    if (!sidebarFolderTree) return;

    const rootActive = currentFolderId === null ? "active" : "";
    const tree = renderFolderTreeNodes(null);

    sidebarFolderTree.innerHTML = `
        <button type="button" class="sidebar-folder-btn ${rootActive}" data-sidebar-folder-id="root">
            <span aria-hidden="true">☁️</span>
            <span class="sidebar-folder-name">Raiz da Drive</span>
        </button>
        ${tree || `<div class="small text-muted px-2 mt-2">Ainda não há pastas.</div>`}
    `;
}

async function loadAllFolders() {
    try {
        allFolders = await apiRequest("/folders", "GET", null, true) || [];
        renderSidebarFolders();
    } catch (error) {
        console.error(error);
        sidebarFolderTree = sidebarFolderTree || document.getElementById("sidebarFolderTree");
        if (sidebarFolderTree) {
            sidebarFolderTree.innerHTML = `<div class="small text-danger px-2">Erro ao carregar pastas.</div>`;
        }
    }
}

function initSidebarFolderEvents() {
    sidebarFolderTree = document.getElementById("sidebarFolderTree");
    if (!sidebarFolderTree || sidebarFolderTree.dataset.bound === "true") return;

    sidebarFolderTree.dataset.bound = "true";
    sidebarFolderTree.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-sidebar-folder-id]");
        if (!btn) return;
        event.preventDefault();
        openFolder(btn.dataset.sidebarFolderId);
    });

    renderSidebarFolders();
}

// ─── Renderização da área principal ──────────────────────────────────────────
// Nota: as pastas são mostradas apenas na sidebar. A área principal mostra
// apenas os ficheiros da localização atual.

function renderDrive(_folders = currentFolders, files = currentFiles) {
    if (!filesGrid) return;

    updateDriveHeader();
    renderSidebarFolders();

    const visibleFiles = files;
    if (!visibleFiles.length) {
        const msg = showOnlyFavorites
            ? "Ainda não há ficheiros marcados como favoritos nesta pasta."
            : "Esta pasta não tem ficheiros. Usa “Adicionar” para carregar ficheiros aqui, ou move ficheiros existentes para esta pasta.";
        filesGrid.className = "row";
        filesGrid.innerHTML = `
            <div class="col-12">
                <div class="alert alert-light border text-muted mb-0">${msg}</div>
            </div>
        `;
        return;
    }

    if (currentView === "list") {
        renderDriveList(visibleFiles);
    } else {
        renderDriveGrid(visibleFiles);
    }
}

function renderDriveGrid(files) {
    filesGrid.className = "row";

    const fileCards = files.map((file) => {
        const originalSize = file.original_file_size ?? file.file_size;
        const favClass = file.is_favorite ? "btn-warning" : "btn-outline-warning";
        const favTitle = file.is_favorite ? "Remover dos favoritos" : "Adicionar aos favoritos";
        const favIcon  = file.is_favorite ? "⭐" : "☆";
        return `
            <div class="col-12 col-sm-6 col-md-4 col-lg-3 mb-4">
                <div class="caixa file-card h-100" data-file-id="${file.id}">
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

    filesGrid.innerHTML = fileCards;
}

function renderDriveList(files) {
    filesGrid.className = "col-12";
    filesGrid.innerHTML = `
        <table class="table table-hover align-middle mb-0">
            <thead class="table-light">
                <tr>
                    <th scope="col">Nome</th>
                    <th scope="col" style="width:110px">Tamanho</th>
                    <th scope="col" style="width:160px">Data</th>
                    <th scope="col" style="width:280px"></th>
                </tr>
            </thead>
            <tbody>
                ${files.map((file) => {
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
                                <span class="text-truncate" style="max-width:320px"
                                      title="${driveEscapeHTML(file.filename)}">
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
                }).join("")}
            </tbody>
        </table>
    `;
}

// ─── Filtros ─────────────────────────────────────────────────────────────────

function filterDrive() {
    const query = String(fileSearchInput?.value || "").trim().toLowerCase();

    let filteredFiles = showOnlyFavorites
        ? currentFiles.filter((f) => f.is_favorite)
        : currentFiles;

    if (query) {
        filteredFiles = filteredFiles.filter((f) => String(f.filename || "").toLowerCase().includes(query));
    }

    renderDrive(currentFolders, filteredFiles);
}

// ─── Carregar Drive ──────────────────────────────────────────────────────────

async function loadUserFiles(folderId = currentFolderId) {
    if (!filesGrid) return;

    currentFolderId = normalizeFolderId(folderId);

    filesGrid.className = "row";
    filesGrid.innerHTML = `
        <div class="col-12">
            <div class="alert alert-light border text-muted mb-0">A carregar ficheiros...</div>
        </div>
    `;

    try {
        const qs = currentFolderId === null ? "" : `?folder_id=${encodeURIComponent(currentFolderId)}`;
        const data = await apiRequest(`/drive${qs}`, "GET", null, true);

        currentFolders = data.folders || [];
        currentFiles = data.files || [];
        currentBreadcrumbs = data.breadcrumbs || [];

        await loadAllFolders();
        filterDrive();

        // Recalcular espaço usado com /files, para contabilizar todos os ficheiros e não só a pasta atual.
        const allFiles = await apiRequest("/files", "GET", null, true);
        const totalUsed = (allFiles || []).reduce((sum, f) => sum + (f.file_size || 0), 0);
        if (window.currentUser) {
            window.currentUser.storage_used = totalUsed;
            window.updateStorageBar?.(totalUsed, window.currentUser.storage_quota ?? 1_073_741_824);
        }
    } catch (error) {
        console.error(error);
        filesGrid.innerHTML = `
            <div class="col-12">
                <div class="alert alert-danger mb-0">Erro ao carregar Drive: ${driveEscapeHTML(error.message)}</div>
            </div>
        `;
    }
}

async function openFolder(folderId) {
    await loadUserFiles(normalizeFolderId(folderId));
}

// ─── Criar pasta ─────────────────────────────────────────────────────────────

function resetFolderModal() {
    if (folderNameInput) folderNameInput.value = "";
    if (folderCreateError) {
        folderCreateError.textContent = "";
        folderCreateError.classList.add("d-none");
    }
    updateDriveHeader();
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
        await loadUserFiles(currentFolderId);
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
        await loadUserFiles(currentFolderId);
    } catch (error) {
        console.error(error);
        showAlert?.(`Erro ao eliminar pasta: ${error.message}`, "danger", false);
    }
}

// ─── Mover ficheiros ─────────────────────────────────────────────────────────

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

    if (moveFileName) {
        moveFileName.textContent = `Ficheiro: ${file.filename}`;
    }
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
        await loadUserFiles(currentFolderId);
    } catch (error) {
        console.error(error);
        if (moveFileError) {
            moveFileError.textContent = error.message;
            moveFileError.classList.remove("d-none");
        }
    }
}

// ─── Modal de password para download ─────────────────────────────────────────

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

// ─── Download ─────────────────────────────────────────────────────────────────

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
    if (!response.ok) {
        throw new Error(data?.detail || "Erro ao obter chave cifrada no keyserver.");
    }

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

// ─── Favorito ─────────────────────────────────────────────────────────────────

async function toggleFavorite(fileId) {
    try {
        const updated = await apiRequest(`/files/${encodeURIComponent(fileId)}/favorite`, "PATCH", null, true);

        const idx = currentFiles.findIndex((f) => Number(f.id) === Number(fileId));
        if (idx !== -1) currentFiles[idx] = updated;

        filterDrive();

        const label = updated.is_favorite ? "adicionado aos" : "removido dos";
        showAlert?.(`"${updated.filename}" ${label} favoritos.`, "success");
    } catch (error) {
        console.error(error);
        showAlert?.(`Erro ao alterar favorito: ${error.message}`, "danger", false);
    }
}

// ─── Delete ───────────────────────────────────────────────────────────────────

async function deleteFile(fileId) {
    const file = currentFiles.find((item) => Number(item.id) === Number(fileId));
    const filename = file?.filename || `ficheiro #${fileId}`;

    if (!confirm(`Tem a certeza que quer eliminar "${filename}"?\n\nEsta ação é irreversível.`)) return;

    try {
        await apiRequest(`/delete?file_id=${encodeURIComponent(fileId)}`, "DELETE", null, true);

        currentFiles = currentFiles.filter((item) => Number(item.id) !== Number(fileId));
        filterDrive();

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

// ─── Event listeners ─────────────────────────────────────────────────────────

filesGrid?.addEventListener("click", (event) => {
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
fileSearchInput?.addEventListener("input", filterDrive);

// A sidebar é injetada dinamicamente. Quando ficar disponível, ligamos os listeners.
window.sidebarLoaded?.then(() => {
    initSidebarFolderEvents();
    loadAllFolders();
});

// Fallback caso a Promise não exista por algum motivo.
document.addEventListener("DOMContentLoaded", () => {
    initSidebarFolderEvents();
    loadUserFiles(null);
});

// ─── Exports globais ─────────────────────────────────────────────────────────

window.loadUserFiles = loadUserFiles;
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
    filterDrive();
};

window.setFavoriteFilter = function (onlyFavorites) {
    showOnlyFavorites = !!onlyFavorites;
    filterDrive();
};
