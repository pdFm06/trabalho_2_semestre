const filesGrid = document.getElementById("filesGrid");
const fileSearchInput = document.getElementById("fileSearchInput");

let currentFiles = [];
let isDownloading = false;

function driveEscapeHTML(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
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

function renderFiles(files = currentFiles) {
    if (!filesGrid) return;

    if (!files || files.length === 0) {
        filesGrid.innerHTML = `
            <div class="col-12">
                <div class="alert alert-light border text-muted mb-0">
                    Ainda não existem ficheiros nesta conta.
                </div>
            </div>
        `;
        return;
    }

    filesGrid.innerHTML = files.map((file) => {
        const originalSize = file.original_file_size ?? file.file_size;
        const numParts = Array.isArray(file.parts) ? file.parts.length : 0;
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
                        <button type="button" class="btn btn-sm btn-primary flex-fill" data-download-file-id="${file.id}">
                            Download
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join("");
}

function filterFiles() {
    const query = String(fileSearchInput?.value || "").trim().toLowerCase();
    if (!query) {
        renderFiles(currentFiles);
        return;
    }
    renderFiles(currentFiles.filter((file) => String(file.filename || "").toLowerCase().includes(query)));
}

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
    if (window.cloudCryptoState?.privateKey) {
        return;
    }
    await askPasswordForPrivateKey();
}

async function fetchEncryptedFile(fileId) {
    const token = getAccessToken();
    if (!token) throw new Error("Sessão expirada. Faça login novamente.");

    const response = await fetch(`${API_BASE_URL}/download/${encodeURIComponent(fileId)}`, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${token}`
        }
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
        headers: {
            Authorization: `Bearer ${token}`
        }
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
    if (!file) {
        throw new Error("Ficheiro não encontrado na lista local.");
    }
    if (!file.file_iv) {
        throw new Error("O IV do ficheiro não está disponível. Não é possível decifrar.");
    }

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

filesGrid?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-download-file-id]");
    if (!button) return;
    downloadAndDecryptFile(button.dataset.downloadFileId);
});

fileSearchInput?.addEventListener("input", filterFiles);

document.addEventListener("DOMContentLoaded", () => {
    loadUserFiles();
});

window.loadUserFiles = loadUserFiles;
window.downloadAndDecryptFile = downloadAndDecryptFile;
