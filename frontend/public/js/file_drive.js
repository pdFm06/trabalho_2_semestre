const filesGrid = document.getElementById("filesGrid");
const fileSearchInput = document.getElementById("fileSearchInput");

let currentFiles = [];
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

// ─── Renderização ────────────────────────────────────────────────────────────

function renderFiles(files = currentFiles) {
    if (!filesGrid) return;

    if (!files || files.length === 0) {
        const msg = showOnlyFavorites
            ? "Ainda não há ficheiros marcados como favoritos."
            : "Ainda não existem ficheiros nesta conta.";
        filesGrid.innerHTML = `
            <div class="col-12">
                <div class="alert alert-light border text-muted mb-0">${msg}</div>
            </div>
        `;
        return;
    }

    if (currentView === "list") {
        renderFilesList(files);
    } else {
        renderFilesGrid(files);
    }
}

function renderFilesGrid(files) {
    filesGrid.className = "row";
    filesGrid.innerHTML = files.map((file) => {
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
                    <div class="px-3 pb-3 d-flex gap-2">
                        <button type="button" class="btn btn-sm btn-primary flex-fill"
                                data-download-file-id="${file.id}">Download</button>
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

function renderFilesList(files) {
    filesGrid.className = "col-12";
    filesGrid.innerHTML = `
        <table class="table table-hover align-middle mb-0">
            <thead class="table-light">
                <tr>
                    <th scope="col">Nome</th>
                    <th scope="col" style="width:110px">Tamanho</th>
                    <th scope="col" style="width:160px">Data</th>
                    <th scope="col" style="width:185px"></th>
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

function filterFiles() {
    const query = String(fileSearchInput?.value || "").trim().toLowerCase();

    let filtered = showOnlyFavorites
        ? currentFiles.filter((f) => f.is_favorite)
        : currentFiles;

    if (query) {
        filtered = filtered.filter((f) => String(f.filename || "").toLowerCase().includes(query));
    }

    renderFiles(filtered);
}

// ─── Carregar ficheiros ───────────────────────────────────────────────────────

async function loadUserFiles() {
    if (!filesGrid) return;

    filesGrid.innerHTML = `
        <div class="col-12">
            <div class="alert alert-light border text-muted mb-0">A carregar ficheiros...</div>
        </div>
    `;

    try {
        currentFiles = await apiRequest("/files", "GET", null, true);
        filterFiles();
    } catch (error) {
        console.error(error);
        filesGrid.innerHTML = `
            <div class="col-12">
                <div class="alert alert-danger mb-0">Erro ao carregar ficheiros: ${driveEscapeHTML(error.message)}</div>
            </div>
        `;
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

        // Actualizar a lista local sem recarregar.
        const idx = currentFiles.findIndex((f) => Number(f.id) === Number(fileId));
        if (idx !== -1) currentFiles[idx] = updated;

        filterFiles();

        const label = updated.is_favorite ? "adicionado aos" : "removido dos";
        showAlert?.(`"${driveEscapeHTML(updated.filename)}" ${label} favoritos.`, "success");
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
        filterFiles();

        // Actualizar barra de espaço após delete.
        if (window.currentUser && file) {
            window.currentUser.storage_used = Math.max(0, (window.currentUser.storage_used || 0) - (file.file_size || 0));
            window.updateStorageBar?.(window.currentUser.storage_used, window.currentUser.storage_quota ?? 1_073_741_824);
        }

        showAlert?.(`"${driveEscapeHTML(filename)}" eliminado com sucesso.`, "success");
    } catch (error) {
        console.error(error);
        showAlert?.(`Erro ao eliminar: ${error.message}`, "danger", false);
    }
}

// ─── Event listeners ─────────────────────────────────────────────────────────

filesGrid?.addEventListener("click", (event) => {
    const downloadBtn = event.target.closest("[data-download-file-id]");
    if (downloadBtn) { downloadAndDecryptFile(downloadBtn.dataset.downloadFileId); return; }

    const favBtn = event.target.closest("[data-favorite-file-id]");
    if (favBtn) { toggleFavorite(favBtn.dataset.favoriteFileId); return; }

    const deleteBtn = event.target.closest("[data-delete-file-id]");
    if (deleteBtn) { deleteFile(deleteBtn.dataset.deleteFileId); return; }
});

fileSearchInput?.addEventListener("input", filterFiles);

document.addEventListener("DOMContentLoaded", () => {
    loadUserFiles();
});

// ─── Exports globais ─────────────────────────────────────────────────────────

window.loadUserFiles = loadUserFiles;
window.downloadAndDecryptFile = downloadAndDecryptFile;
window.deleteFile = deleteFile;
window.toggleFavorite = toggleFavorite;

window.setView = function (mode) {
    if (mode !== "grid" && mode !== "list") return;
    currentView = mode;

    const btnGrid = document.getElementById("btnViewGrid");
    const btnList = document.getElementById("btnViewList");
    if (btnGrid && btnList) {
        btnGrid.className = mode === "grid" ? "btn btn-sm btn-secondary" : "btn btn-sm btn-outline-secondary";
        btnList.className = mode === "list" ? "btn btn-sm btn-secondary" : "btn btn-sm btn-outline-secondary";
    }
    filterFiles();
};

window.setFavoriteFilter = function (onlyFavorites) {
    showOnlyFavorites = !!onlyFavorites;

    // Actualizar estilo do botão "Favoritos" na toolbar.
    const btnFav = document.getElementById("btnFavoritos");
    if (btnFav) {
        btnFav.className = showOnlyFavorites
            ? "btn btn-sm btn-warning"
            : "btn btn-sm btn-outline-warning";
    }

    filterFiles();
};