// Ficheiro responsável por frontend/public/js/api.js.
const API_BASE_URL = "http://localhost:8000";
window.KEYSERVER_BASE_URL = window.KEYSERVER_BASE_URL || "http://localhost:9002";

// Obtém o token JWT guardado na sessão do browser.
function getAccessToken() {
    return sessionStorage.getItem("access_token");
}

// Guarda o token JWT recebido após autenticação.
function setAccessToken(token) {
    sessionStorage.setItem("access_token", token);
}

// Remove o token JWT da sessão atual.
function clearAccessToken() {
    sessionStorage.removeItem("access_token");
}

// Executa pedidos HTTP ao backend, adicionando o token quando necessário.
async function apiRequest(endpoint, method = "GET", body = null, useAuth = false) {
    const headers = {
        "Content-Type": "application/json"
    };

    if (useAuth) {
        const token = getAccessToken();
        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }
    }

    const options = {
        method,
        headers
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);

    let data = null;
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
        data = await response.json();
    }

    if (!response.ok) {
        const message = data?.detail || "Erro no pedido HTTP";
        throw new Error(Array.isArray(message) ? JSON.stringify(message) : message);
    }

    return data;
}
