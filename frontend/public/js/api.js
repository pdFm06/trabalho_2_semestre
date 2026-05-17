const API_BASE_URL = "http://localhost:8000";
window.KEYSERVER_BASE_URL = window.KEYSERVER_BASE_URL || "http://localhost:9002";

function getAccessToken() {
    return sessionStorage.getItem("access_token");
}

function setAccessToken(token) {
    sessionStorage.setItem("access_token", token);
}

function clearAccessToken() {
    sessionStorage.removeItem("access_token");
}

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
