const KEYSERVER_BASE_URL = window.KEYSERVER_BASE_URL || "http://localhost:9002";

const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const browseBtn = document.getElementById("browseBtn");
const uploadBtn = document.getElementById("uploadBtn");
const fileItems = document.getElementById("fileItems");

let selectedFiles = [];
let isUploading = false;

function ensureAlertContainer() {
    if (!document.getElementById("uploadAlertContainer")) {
        const container = document.createElement("div");
        container.id = "uploadAlertContainer";
        container.style.position = "fixed";
        container.style.top = "20px";
        container.style.right = "20px";
        container.style.zIndex = "9999";
        container.style.maxWidth = "430px";
        document.body.appendChild(container);
    }
}

function escapeHTML(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isFetchNetworkError(error) {
    const message = String(error?.message || "").toLowerCase();
    return error instanceof TypeError || message.includes("fetch") || message.includes("network");
}

async function fetchWithRetry(url, options, retryOptions = {}) {
    const attempts = retryOptions.attempts ?? 5;
    const delayMs = retryOptions.delayMs ?? 700;
    const retryStatusCodes = retryOptions.retryStatusCodes ?? [502, 503, 504];

    let lastError = null;

    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            const response = await fetch(url, options);

            if (retryStatusCodes.includes(response.status) && attempt < attempts) {
                await sleep(delayMs * attempt);
                continue;
            }

            return response;
        } catch (error) {
            lastError = error;

            if (!isFetchNetworkError(error) || attempt === attempts) {
                throw error;
            }

            await sleep(delayMs * attempt);
        }
    }

    throw lastError || new Error("Erro de rede no pedido HTTP.");
}

function showAlert(message, type = "info", autoDismiss = true) {
    ensureAlertContainer();
    const container = document.getElementById("uploadAlertContainer");
    const alertId = `alert-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const alertHtml = `
        <div id="${alertId}" class="alert alert-${escapeHTML(type)} alert-dismissible fade show shadow-sm" role="alert">
            ${escapeHTML(message)}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Fechar"></button>
        </div>
    `;

    container.insertAdjacentHTML("beforeend", alertHtml);

    if (autoDismiss) {
        setTimeout(() => {
            const alert = document.getElementById(alertId);
            if (alert) {
                bootstrap.Alert.getOrCreateInstance(alert).close();
            }
        }, 6000);
    }
}

function setUploadStatus(message) {
    const statusElement = document.getElementById("uploadStatus");
    if (statusElement) {
        statusElement.textContent = message;
    }
}

function setUploadingState(uploading) {
    isUploading = uploading;
    uploadBtn.disabled = uploading || selectedFiles.length === 0;
    uploadBtn.textContent = uploading ? "A enviar..." : "Enviar Ficheiros";
}

async function ensurePublicKeyLoaded() {
    if (window.cloudCryptoState?.publicKey) {
        return;
    }

    const user = await apiRequest("/users/me", "GET", null, true);
    const publicKey = await importUserPublicKey(user.public_key);

    window.cloudCryptoState = window.cloudCryptoState || {};
    window.cloudCryptoState.publicKey = publicKey;
}

async function ensureKeyserverAvailable() {
    const response = await fetchWithRetry(`${KEYSERVER_BASE_URL}/health`, {
        method: "GET"
    }, {
        attempts: 6,
        delayMs: 800
    });

    if (!response.ok) {
        throw new Error("Keyserver indisponível. Confirme se o container keyserver está ativo.");
    }
}

async function uploadEncryptedFileToBackend(file, encryptedMaterial) {
    const token = getAccessToken();
    if (!token) {
        throw new Error("Sessão expirada. Faça login novamente.");
    }

    const formData = new FormData();
    formData.append("file", encryptedMaterial.encryptedBlob, file.name);
    formData.append("file_iv", encryptedMaterial.file_iv);
    formData.append("original_file_size", String(encryptedMaterial.original_file_size));

    const response = await fetch(`${API_BASE_URL}/upload`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`
        },
        body: formData
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
        const message = data?.detail || "Erro ao enviar ficheiro cifrado para o backend.";
        throw new Error(Array.isArray(message) ? JSON.stringify(message) : message);
    }

    return data;
}


async function deleteBackendFile(fileId) {
    const token = getAccessToken();
    if (!token || !fileId) {
        return false;
    }

    const response = await fetch(`${API_BASE_URL}/delete?file_id=${encodeURIComponent(fileId)}`, {
        method: "DELETE",
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    return response.ok;
}

async function storeEncryptedFileKey(fileId, encryptedMaterial) {
    const token = getAccessToken();
    if (!token) {
        throw new Error("Sessão expirada. Faça login novamente.");
    }

    const response = await fetchWithRetry(`${KEYSERVER_BASE_URL}/keys`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
            file_id: fileId,
            encrypted_file_key: encryptedMaterial.encrypted_file_key,
            key_algorithm: encryptedMaterial.key_encryption_algorithm,
            file_key_algorithm: encryptedMaterial.encryption_mode
        })
    }, {
        attempts: 6,
        delayMs: 800
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
        const message = data?.detail || "Erro ao guardar chave cifrada no keyserver.";
        throw new Error(Array.isArray(message) ? JSON.stringify(message) : message);
    }

    return data;
}

browseBtn?.addEventListener("click", () => {
    fileInput.click();
});

fileInput?.addEventListener("change", (e) => {
    handleFiles(e.target.files);
});

dropZone?.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.style.borderColor = "#0d6efd";
    dropZone.style.backgroundColor = "#f0f7ff";
});

dropZone?.addEventListener("dragleave", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.style.borderColor = "#ccc";
    dropZone.style.backgroundColor = "transparent";
});

dropZone?.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.style.borderColor = "#ccc";
    dropZone.style.backgroundColor = "transparent";
    handleFiles(e.dataTransfer.files);
});

uploadBtn?.addEventListener("click", async () => {
    if (isUploading || selectedFiles.length === 0) {
        return;
    }

    try {
        setUploadingState(true);
        setUploadStatus("A preparar chaves do utilizador...");
        await ensurePublicKeyLoaded();

        setUploadStatus("A verificar ligação ao keyserver...");
        await ensureKeyserverAvailable();

        let uploadedCount = 0;

        for (let index = 0; index < selectedFiles.length; index++) {
            const file = selectedFiles[index];
            setUploadStatus(`A cifrar ${index + 1}/${selectedFiles.length}: ${file.name}`);

            const encryptedMaterial = await encryptFileForUpload(file);

            setUploadStatus(`A enviar ficheiro cifrado ${index + 1}/${selectedFiles.length}: ${file.name}`);
            const backendFile = await uploadEncryptedFileToBackend(file, encryptedMaterial);

            setUploadStatus(`A guardar chave cifrada ${index + 1}/${selectedFiles.length}: ${file.name}`);
            try {
                await storeEncryptedFileKey(backendFile.id, encryptedMaterial);
            } catch (keyError) {
                await deleteBackendFile(backendFile.id);
                throw new Error(
                    `O ficheiro "${file.name}" foi recebido pelo backend, mas a chave cifrada não foi guardada no keyserver. ` +
                    `O registo do ficheiro foi removido para evitar ficheiros sem chave. ` +
                    `Isto pode acontecer se o keyserver ainda não estiver pronto. Detalhe: ${keyError.message}`
                );
            }

            uploadedCount += 1;
        }

        selectedFiles = [];
        updateFileList();
        fileInput.value = "";
        setUploadStatus("");
        showAlert(`${uploadedCount} ficheiro(s) cifrado(s) e enviado(s) com sucesso.`, "success");

        if (typeof window.loadUserFiles === "function") {
            await window.loadUserFiles();
        }

        const modalElement = document.getElementById("uploadModal");
        const modal = bootstrap.Modal.getInstance(modalElement);
        modal?.hide();
    } catch (error) {
        console.error(error);
        showAlert(error.message, "danger", false);
        setUploadStatus("Ocorreu um erro no envio.");
    } finally {
        setUploadingState(false);
    }
});

function handleFiles(files) {
    selectedFiles = Array.from(files || []);
    updateFileList();
    uploadBtn.disabled = selectedFiles.length === 0;
}

function updateFileList() {
    fileItems.innerHTML = "";

    selectedFiles.forEach((file, index) => {
        const li = document.createElement("li");
        li.className = "list-group-item d-flex justify-content-between align-items-center";
        const fileSize = formatFileSize(file.size);

        li.innerHTML = `
            <div>
                <strong>${escapeHTML(file.name)}</strong>
                <br>
                <small class="text-muted">${fileSize}</small>
            </div>
            <button type="button" class="btn btn-sm btn-danger" onclick="removeFile(${index})" ${isUploading ? "disabled" : ""}>
                Remover
            </button>
        `;

        fileItems.appendChild(li);
    });
}

function removeFile(index) {
    if (isUploading) {
        return;
    }
    selectedFiles.splice(index, 1);
    updateFileList();
    uploadBtn.disabled = selectedFiles.length === 0;
}

function formatFileSize(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`;
}

window.removeFile = removeFile;
