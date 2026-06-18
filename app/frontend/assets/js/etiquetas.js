mountNav("etiquetas");

let products = [];
let locations = [];
let activeTab = "products";

function currentFilters() {
    return formDataObject(byId("filterForm"));
}

function sortItems(items, sortKey) {
    return [...items].sort((a, b) => String(a[sortKey] || "").localeCompare(String(b[sortKey] || ""), "pt-BR", { numeric: true }));
}

function productCard(produto) {
    return `
        <article class="card shadow-sm label-card" data-label-card>
            <div class="card-body text-center">
                <div class="fw-semibold mb-1">${escapeHtml(produto.nome)}</div>
                <div class="small text-secondary mb-3">Código: ${escapeHtml(produto.codigo)}</div>
                <img class="qr-img border rounded mb-3" src="/api/etiquetas/produto/${produto.id}/qr.png" alt="QR Code do produto">
                <div class="no-print"><button class="btn btn-outline-primary btn-sm" type="button" data-print-one>Imprimir</button></div>
            </div>
        </article>
    `;
}

function locationCard(loc) {
    return `
        <article class="card shadow-sm label-card" data-label-card>
            <div class="card-body text-center">
                <div class="fw-semibold mb-1">${escapeHtml(loc.codigo)}</div>
                <div>${escapeHtml(loc.nome)}</div>
                <div class="small text-secondary mb-3">${escapeHtml(friendlyArmario(loc.armario))} > ${escapeHtml(loc.prateleira)}</div>
                <img class="qr-img border rounded mb-3" src="/api/etiquetas/localizacao/${encodeURIComponent(loc.codigo)}/qr.png" alt="QR Code da localização">
                <div class="no-print"><button class="btn btn-outline-primary btn-sm" type="button" data-print-one>Imprimir</button></div>
            </div>
        </article>
    `;
}

function renderLabels() {
    const filters = currentFilters();
    const q = String(filters.q || "").trim().toLowerCase();
    const sort = filters.sort || "nome";
    const filteredProducts = sortItems(products.filter((produto) =>
        !q || `${produto.nome} ${produto.codigo}`.toLowerCase().includes(q)
    ), sort === "codigo" ? "codigo" : "nome");
    const filteredLocations = sort === "codigo"
        ? sortItems(locations.filter((loc) => !q || `${loc.nome} ${loc.codigo}`.toLowerCase().includes(q)), "codigo")
        : sortLocations(locations.filter((loc) => !q || `${loc.nome} ${loc.codigo}`.toLowerCase().includes(q)));

    byId("productLabels").innerHTML = filteredProducts.map(productCard).join("") || `<div class="text-secondary">Nenhum produto encontrado.</div>`;
    byId("locationLabels").innerHTML = filteredLocations.map(locationCard).join("") || `<div class="text-secondary">Nenhuma localização encontrada.</div>`;
}

function setActiveTab(tab) {
    activeTab = tab;
    byId("productLabels").classList.toggle("d-none", tab !== "products");
    byId("locationLabels").classList.toggle("d-none", tab !== "locations");
    byId("labelTabs").querySelectorAll("[data-label-tab]").forEach((button) => {
        button.classList.toggle("active", button.dataset.labelTab === tab);
    });
}

function printHtml(content) {
    const win = window.open("", "_blank", "width=720,height=900");
    if (!win) {
        setAlert("Não foi possível abrir a impressão. Verifique o bloqueador de pop-ups.", "danger");
        return;
    }
    win.document.write(`
        <!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
        <title>Imprimir etiqueta</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
        <link href="/assets/styles.css" rel="stylesheet"></head>
        <body class="p-3"><main class="label-grid">${content}</main></body></html>
    `);
    win.document.close();
    win.addEventListener("load", () => win.print());
}

async function loadData() {
    const [productResponse, locationResponse] = await Promise.all([
        Api.get("/api/produtos"),
        Api.get("/api/localizacoes"),
    ]);
    products = productResponse.data.produtos;
    locations = sortLocations(locationResponse.data.localizacoes);
    renderLabels();
}

(async function init() {
    await requireAuth();
    await loadData();

    byId("labelTabs").addEventListener("click", (event) => {
        const button = event.target.closest("[data-label-tab]");
        if (!button) return;
        setActiveTab(button.dataset.labelTab);
    });

    byId("filterForm").addEventListener("submit", (event) => {
        event.preventDefault();
        renderLabels();
    });

    byId("filterForm").addEventListener("input", renderLabels);
    byId("filterForm").addEventListener("change", renderLabels);

    document.addEventListener("click", (event) => {
        const button = event.target.closest("[data-print-one]");
        if (!button) return;
        printHtml(button.closest("[data-label-card]").outerHTML);
    });

    byId("printBatch").addEventListener("click", () => {
        const source = activeTab === "products" ? byId("productLabels") : byId("locationLabels");
        printHtml(source.innerHTML);
    });
})();
