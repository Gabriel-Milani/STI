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

function productCard(item) {
    return `
        <article class="card shadow-sm label-card thermal-label" data-label-card>
            <div class="card-body label-body">
                <img class="qr-img label-qr" src="${escapeHtml(item.qrUrl)}" alt="QR Code da etiqueta">
                <div class="label-copy">
                    <div class="label-title">${escapeHtml(item.nome)}</div>
                    <div class="label-code">${escapeHtml(item.codigo)}</div>
                    <div class="label-meta">${escapeHtml(item.meta)}</div>
                </div>
                <div class="no-print"><button class="btn btn-outline-primary btn-sm" type="button" data-print-one>Imprimir</button></div>
            </div>
        </article>
    `;
}

function locationCard(loc) {
    return `
        <article class="card shadow-sm label-card thermal-label" data-label-card>
            <div class="card-body label-body">
                <img class="qr-img label-qr" src="/api/etiquetas/localizacao/${encodeURIComponent(loc.codigo)}/qr.png" alt="QR Code da localização">
                <div class="label-copy">
                    <div class="label-title">${escapeHtml(loc.codigo)}</div>
                    <div class="label-code">${escapeHtml(loc.nome)}</div>
                    <div class="label-meta">${escapeHtml(friendlyArmario(loc.armario))} > ${escapeHtml(loc.prateleira)}</div>
                </div>
                <div class="no-print"><button class="btn btn-outline-primary btn-sm" type="button" data-print-one>Imprimir</button></div>
            </div>
        </article>
    `;
}

function renderLabels() {
    const filters = currentFilters();
    const q = String(filters.q || "").trim().toLowerCase();
    const sort = filters.sort || "nome";
    const filteredProducts = sortItems(products.filter((item) =>
        !q || `${item.nome} ${item.codigo} ${item.produtoCodigo || ""}`.toLowerCase().includes(q)
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
        <style>
            @page { size: 60mm 30mm; margin: 0; }
            * { box-sizing: border-box; }
            html,
            body {
                background: #fff;
                height: 30mm;
                margin: 0;
                padding: 0;
                width: 60mm;
            }
            .thermal-print-grid {
                display: block;
                margin: 0;
                padding: 0;
                width: 60mm;
            }
            .thermal-label {
                background: #fff;
                border: 0;
                box-shadow: none;
                display: block;
                height: 30mm;
                margin: 0;
                overflow: hidden;
                padding: 0;
                page-break-after: always;
                page-break-inside: avoid;
                break-after: page;
                break-inside: avoid;
                width: 60mm;
            }
            .thermal-label:last-child {
                page-break-after: auto;
                break-after: auto;
            }
            .label-body {
                align-items: center;
                display: grid;
                gap: 2mm;
                grid-template-columns: 21mm 1fr;
                height: 30mm;
                margin: 0;
                overflow: hidden;
                padding: 2mm 2.5mm;
                width: 60mm;
            }
            .label-qr,
            .qr-img {
                border: 0;
                display: block;
                height: 20mm;
                margin: 0;
                width: 20mm;
            }
            .label-copy {
                min-width: 0;
                overflow: hidden;
            }
            .label-title {
                color: #000;
                font: 700 8pt/1.05 Arial, Helvetica, sans-serif;
                max-height: 17pt;
                overflow: hidden;
                text-transform: uppercase;
            }
            .label-code {
                color: #000;
                font: 700 7pt/1.05 Arial, Helvetica, sans-serif;
                margin-top: 1.2mm;
                overflow-wrap: anywhere;
            }
            .label-meta {
                color: #000;
                font: 600 6pt/1.05 Arial, Helvetica, sans-serif;
                margin-top: 1.2mm;
                overflow-wrap: anywhere;
            }
            .no-print,
            button {
                display: none !important;
            }
        </style></head>
        <body class="thermal-print-page"><main class="label-grid thermal-print-grid">${content}</main></body></html>
    `);
    win.document.close();
    win.addEventListener("load", async () => {
        const images = Array.from(win.document.images);
        await Promise.all(images.map((img) => {
            if (img.complete) return Promise.resolve();
            return new Promise((resolve) => {
                img.addEventListener("load", resolve, { once: true });
                img.addEventListener("error", resolve, { once: true });
            });
        }));
        setTimeout(() => win.print(), 100);
    });
}

async function loadData() {
    const [productResponse, locationResponse] = await Promise.all([
        Api.get("/api/produtos"),
        Api.get("/api/localizacoes"),
    ]);
    const productRows = productResponse.data.produtos;
    const unitProducts = productRows.filter((produto) => produto.tipo_controle === "unidade");
    const unitDetails = await Promise.all(unitProducts.map((produto) => Api.get(`/api/produtos/${encodeURIComponent(produto.codigo)}`)));
    const units = unitDetails.flatMap((response) => {
        const produto = response.data.produto;
        return response.data.unidades.map((unit) => ({
            id: unit.id,
            nome: produto.nome,
            codigo: unit.codigo_unidade,
            produtoCodigo: produto.codigo,
            meta: `${produto.codigo} | UNIDADE`,
            qrUrl: `/api/etiquetas/unidade/${unit.id}/qr.png`,
        }));
    });
    const quantityProducts = productRows
        .filter((produto) => produto.tipo_controle !== "unidade")
        .map((produto) => ({
            id: produto.id,
            nome: produto.nome,
            codigo: produto.codigo,
            produtoCodigo: produto.codigo,
            meta: "PRODUTO",
            qrUrl: `/api/etiquetas/produto/${produto.id}/qr.png`,
        }));
    products = [...quantityProducts, ...units];
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
