// abrir e fechar o menu dos 3 pontinhos
const menus = document.querySelectorAll(".file-menu");

menus.forEach(menu => {
    menu.addEventListener("click", function (event) {

        event.stopPropagation();

        const dropdown = this.nextElementSibling;

        document.querySelectorAll(".menu-dropdown").forEach(item => {
            if (item !== dropdown) {
                item.classList.remove("show");
            }
        });

        dropdown.classList.toggle("show");

    });
});

// fechar o menu quando clicar fora
document.addEventListener("click", function () {
    document.querySelectorAll(".menu-dropdown").forEach(item => {
        item.classList.remove("show");
    });
});

// exemplo de ação nos itens

const menuItems = document.querySelectorAll(".menu-item");

menuItems.forEach(item => {
    item.addEventListener("click", function () {

        alert("Você clicou em: " + this.textContent);

    });
});