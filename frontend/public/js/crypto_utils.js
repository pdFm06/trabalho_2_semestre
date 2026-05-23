// Ficheiro responsável por frontend/public/js/crypto_utils.js.
const KDF_ITERATIONS = 600000;


// Converte bytes para Base64URL para transporte seguro em JSON.
function arrayBufferToBase64Url(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";

    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }

    return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}


// Converte Base64URL de volta para bytes.
function base64UrlToArrayBuffer(base64url) {
    let clean = String(base64url)
        .trim()
        .replace(/\s+/g, "")
        .replace(/-/g, "+")
        .replace(/_/g, "/");

    while (clean.length % 4 !== 0) {
        clean += "=";
    }

    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }

    return bytes.buffer;
}


// Mantém compatibilidade com chamadas antigas de conversão para Base64URL.
function arrayBufferToBase64(buffer) {
    return arrayBufferToBase64Url(buffer);
}

// Mantém compatibilidade com chamadas antigas de conversão de Base64URL.
function base64ToArrayBufferUrl(value) {
    return base64UrlToArrayBuffer(value);
}

// Mantém compatibilidade com chamadas antigas de conversão para bytes.
function base64ToArrayBuffer(value) {
    return base64UrlToArrayBuffer(value);
}


// Remove espaços da recovery key introduzida pelo utilizador.
function normalizeRecoveryKey(recoveryKey) {
    return String(recoveryKey)
        .trim()
        .replace(/\s+/g, "");
}


// Formata a recovery key em blocos para facilitar leitura e cópia.
function formatRecoveryKeyForDisplay(recoveryKey) {
    return String(recoveryKey).match(/.{1,4}/g).join(" ");
}


// Alias usado por código antigo para formatar a recovery key.
function formatRecoveryKey(recoveryKey) {
    return formatRecoveryKeyForDisplay(recoveryKey);
}


// Calcula o hash da recovery key enviado ao backend para verificação MFA.
async function recoveryKeyHashForServer(recoveryKey) {
    const normalized = normalizeRecoveryKey(recoveryKey);
    const data = new TextEncoder().encode(normalized);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return arrayBufferToBase64Url(digest);
}


// Gera uma recovery key aleatória de alta entropia.
function generateRecoveryKey() {
    const recoveryKeyBytes = crypto.getRandomValues(new Uint8Array(32));
    return arrayBufferToBase64Url(recoveryKeyBytes.buffer);
}


// Converte e valida uma recovery key antes de a usar como chave.
function recoveryKeyToArrayBuffer(recoveryKey) {
    const clean = normalizeRecoveryKey(recoveryKey);
    const buffer = base64UrlToArrayBuffer(clean);

    if (buffer.byteLength !== 32) {
        throw new Error("Recovery key inválida. Confirme se copiou a chave completa.");
    }

    return buffer;
}


// Importa a recovery key como chave AES-GCM.
async function importRecoveryAesKey(recoveryKey) {
    const recoveryKeyBuffer = recoveryKeyToArrayBuffer(recoveryKey);

    return await crypto.subtle.importKey(
        "raw",
        recoveryKeyBuffer,
        {
            name: "AES-GCM"
        },
        false,
        ["encrypt", "decrypt"]
    );
}


// Deriva uma chave AES a partir da password usando PBKDF2.
async function derivePrivateKeyEncryptionKey(password, saltBase64, iterations = KDF_ITERATIONS) {
    const passwordKey = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        "PBKDF2",
        false,
        ["deriveKey"]
    );

    return await crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: base64UrlToArrayBuffer(saltBase64),
            iterations,
            hash: "SHA-256"
        },
        passwordKey,
        {
            name: "AES-GCM",
            length: 256
        },
        false,
        ["encrypt", "decrypt"]
    );
}


// Cifra a chave privada do utilizador com uma chave derivada da password.
async function encryptPrivateKeyForPassword(privateKeyRaw, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const privateKeyIv = crypto.getRandomValues(new Uint8Array(12));

    const saltBase64 = arrayBufferToBase64Url(salt.buffer);
    const privateKeyIvBase64 = arrayBufferToBase64Url(privateKeyIv.buffer);

    const privateKeyEncryptionKey = await derivePrivateKeyEncryptionKey(
        password,
        saltBase64,
        KDF_ITERATIONS
    );

    const encryptedPrivateKeyRaw = await crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv: privateKeyIv
        },
        privateKeyEncryptionKey,
        privateKeyRaw
    );

    return {
        kdf_salt: saltBase64,
        kdf_iterations: KDF_ITERATIONS,
        kdf_hash: "SHA-256",
        encrypted_private_key: arrayBufferToBase64Url(encryptedPrivateKeyRaw),
        private_key_iv: privateKeyIvBase64
    };
}


// Cifra a mesma chave privada com a recovery key.
async function encryptPrivateKeyForRecoveryKey(privateKeyRaw, recoveryKey) {
    const recoveryKeyIv = crypto.getRandomValues(new Uint8Array(12));
    const recoveryAesKey = await importRecoveryAesKey(recoveryKey);

    const encryptedPrivateKeyRaw = await crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv: recoveryKeyIv
        },
        recoveryAesKey,
        privateKeyRaw
    );

    return {
        encrypted_private_key_recovery: arrayBufferToBase64Url(encryptedPrivateKeyRaw),
        recovery_key_iv: arrayBufferToBase64Url(recoveryKeyIv.buffer)
    };
}


// Gera o par de chaves do utilizador e os materiais cifrados do registo.
async function generateUserCryptoMaterial(password) {
    const keyPair = await crypto.subtle.generateKey(
        {
            name: "RSA-OAEP",
            modulusLength: 4096,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: "SHA-256"
        },
        true,
        ["encrypt", "decrypt"]
    );

    const publicKeyRaw = await crypto.subtle.exportKey("spki", keyPair.publicKey);
    const privateKeyRaw = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);

    const recoveryKey = generateRecoveryKey();

    const passwordMaterial = await encryptPrivateKeyForPassword(privateKeyRaw, password);
    const recoveryMaterial = await encryptPrivateKeyForRecoveryKey(privateKeyRaw, recoveryKey);
    const recoveryKeyHash = await recoveryKeyHashForServer(recoveryKey);

    return {
        ...passwordMaterial,
        ...recoveryMaterial,
        public_key: arrayBufferToBase64Url(publicKeyRaw),
        key_algorithm: "RSA-OAEP-4096-SHA-256",
        recovery_key_hash: recoveryKeyHash,
        recovery_key: formatRecoveryKeyForDisplay(recoveryKey)
    };
}


// Recupera a chave privada com a recovery key e volta a cifrá-la com nova password.
async function rebuildUserCryptoMaterialFromRecovery(newPassword, recoveryKey, resetPayload) {
    const recoveryAesKey = await importRecoveryAesKey(recoveryKey);

    const privateKeyRaw = await crypto.subtle.decrypt(
        {
            name: "AES-GCM",
            iv: base64UrlToArrayBuffer(resetPayload.recovery_key_iv)
        },
        recoveryAesKey,
        base64UrlToArrayBuffer(resetPayload.encrypted_private_key_recovery)
    );

    const newRecoveryKey = generateRecoveryKey();

    const passwordMaterial = await encryptPrivateKeyForPassword(privateKeyRaw, newPassword);
    const recoveryMaterial = await encryptPrivateKeyForRecoveryKey(privateKeyRaw, newRecoveryKey);
    const recoveryKeyHash = await recoveryKeyHashForServer(newRecoveryKey);

    return {
        ...passwordMaterial,
        ...recoveryMaterial,
        public_key: resetPayload.public_key,
        key_algorithm: resetPayload.key_algorithm || "RSA-OAEP-4096-SHA-256",
        recovery_key_hash: recoveryKeyHash,
        recovery_key: formatRecoveryKeyForDisplay(newRecoveryKey)
    };
}


// Decifra e importa a chave privada do utilizador após login.
async function decryptUserPrivateKey(password, loginResponse) {
    const privateKeyEncryptionKey = await derivePrivateKeyEncryptionKey(
        password,
        loginResponse.kdf_salt,
        loginResponse.kdf_iterations
    );

    const privateKeyRaw = await crypto.subtle.decrypt(
        {
            name: "AES-GCM",
            iv: base64UrlToArrayBuffer(loginResponse.private_key_iv)
        },
        privateKeyEncryptionKey,
        base64UrlToArrayBuffer(loginResponse.encrypted_private_key)
    );

    return await crypto.subtle.importKey(
        "pkcs8",
        privateKeyRaw,
        {
            name: "RSA-OAEP",
            hash: "SHA-256"
        },
        false,
        ["decrypt"]
    );
}


// Importa a chave pública do utilizador para cifrar chaves de ficheiros.
async function importUserPublicKey(publicKeyBase64) {
    return await crypto.subtle.importKey(
        "spki",
        base64UrlToArrayBuffer(publicKeyBase64),
        {
            name: "RSA-OAEP",
            hash: "SHA-256"
        },
        false,
        ["encrypt"]
    );
}

window.cloudCryptoState = window.cloudCryptoState || {
    privateKey: null,
    publicKey: null
};


// Calcula SHA-256 e devolve o resultado em Base64URL.
async function sha256Base64(buffer) {
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return arrayBufferToBase64Url(digest);
}


// Cifra um ficheiro no browser e cifra a respetiva chave AES com RSA-OAEP.
async function encryptFileForUpload(file) {
    if (!window.cloudCryptoState?.publicKey) {
        throw new Error("Chave pública não carregada. Termine sessão e faça login novamente.");
    }

    let fileKey = null;
    let rawFileKey = null;

    try {
        fileKey = await crypto.subtle.generateKey(
            {
                name: "AES-GCM",
                length: 256
            },
            true,
            ["encrypt", "decrypt"]
        );

        const fileIv = crypto.getRandomValues(new Uint8Array(12));
        const plainBuffer = await file.arrayBuffer();

        const encryptedFileBuffer = await crypto.subtle.encrypt(
            {
                name: "AES-GCM",
                iv: fileIv
            },
            fileKey,
            plainBuffer
        );

        rawFileKey = await crypto.subtle.exportKey("raw", fileKey);

        const encryptedFileKey = await crypto.subtle.encrypt(
            {
                name: "RSA-OAEP"
            },
            window.cloudCryptoState.publicKey,
            rawFileKey
        );

        const encryptedFileHash = await sha256Base64(encryptedFileBuffer);

        return {
            encryptedBlob: new Blob([encryptedFileBuffer], {
                type: "application/octet-stream"
            }),
            file_iv: arrayBufferToBase64Url(fileIv.buffer),
            encrypted_file_key: arrayBufferToBase64Url(encryptedFileKey),
            encrypted_file_hash: encryptedFileHash,
            original_file_size: file.size,
            encrypted_file_size: encryptedFileBuffer.byteLength,
            encryption_mode: "AES-256-GCM",
            key_encryption_algorithm: "RSA-OAEP-4096-SHA-256"
        };
    } finally {
        fileKey = null;
        rawFileKey = null;
    }
}

// Decifra a chave do ficheiro e depois decifra o conteúdo recebido do backend.
async function decryptDownloadedFile(encryptedBlob, encryptedFileKeyBase64, fileIvBase64) {
    if (!window.cloudCryptoState?.privateKey) {
        throw new Error("Chave privada não carregada. Introduza novamente a password para continuar.");
    }

    const encryptedFileKeyBuffer = base64UrlToArrayBuffer(encryptedFileKeyBase64);
    const rawFileKey = await crypto.subtle.decrypt(
        { name: "RSA-OAEP" },
        window.cloudCryptoState.privateKey,
        encryptedFileKeyBuffer
    );

    const fileAesKey = await crypto.subtle.importKey(
        "raw",
        rawFileKey,
        { name: "AES-GCM" },
        false,
        ["decrypt"]
    );

    const encryptedFileBuffer = await encryptedBlob.arrayBuffer();

    return await crypto.subtle.decrypt(
        {
            name: "AES-GCM",
            iv: base64UrlToArrayBuffer(fileIvBase64)
        },
        fileAesKey,
        encryptedFileBuffer
    );
}
