document.addEventListener("DOMContentLoaded", async () => {
    const token = getAccessToken();

    if (!token) {
        window.location.href = "./auth/login.html";
        return;
    }

    try {
        const user = await apiRequest("/users/me", "GET", null, true);
        const emailElement = document.getElementById("currentUserEmail");

        if (emailElement) {
            emailElement.textContent = user.email;
        }
    } catch (error) {
        console.error(error);
        clearAccessToken();
        window.location.href = "./auth/login.html";
    }

    const logoutButton = document.getElementById("logoutButton");
    if (logoutButton) {
        logoutButton.addEventListener("click", () => {
            clearAccessToken();
            window.cloudCryptoState = { privateKey: null, publicKey: null };
            window.location.href = "./auth/login.html";
        });
    }
});
