mountNav("produtos");

let products = [];
let activeFilter = "todos";
let activeLocationsCount = 0;

const categoryIcons = [
    ["mouse", "▣"],
    ["teclado", "⌨"],
    ["cabo", "⌁"],
    ["fone", "◖"],
    ["headset", "◖"],
    ["ssd", "▤"],
    ["bateria", "▥"],
    ["impressora", "▦"],
    ["limpeza", "✦"],
];

function productIcon(produto) {
    const source = `${produto.categoria || ""} ${produto.nome || ""}`.toLowerCase();
    const found = categoryIcons.find(([key]) => source.includes(key));
    return found ? found[1] : "◆";
}

function controlBadge(produto) {
    const unit = (produto.tipo_controle || "quantidade") === "unidade";
    return `<span class="catalog-badge ${unit ? "badge-unit" : "badge-qty"}">${unit ? "Unidade" : "Quantidade"}</span>`;
}

function categoryBadge(produto) {
    return `<span class="catalog-badge badge-category">${escapeHtml(produto.categoria || "Sem categoria")}</span>`;
}

function statusMeta(status) {
    return {
        ok: { label: "Ok", cls: "status-ok-card" },
        baixo: { label: "Baixo", cls: "status-low-card" },
        zerado: { label: "Zerado", cls: "status-zero-card" },
    }[status] || { label: "Ok", cls: "status-ok-card" };
}

function productMatchesFilter(produto) {
    if (activeFilter === "todos") return true;
    if (activeFilter === "baixo") return produto.status === "baixo";
    if (activeFilter === "zerado") return produto.status === "zerado";
    if (activeFilter === "quantidade") return (produto.tipo_controle || "quantidade") === "quantidade";
    if (activeFilter === "unidade") return produto.tipo_controle === "unidade";
    return true;
}

function movementLink(produto, type) {
    return `/produtos/${encodeURIComponent(produto.codigo)}?acao=${encodeURIComponent(type)}`;
}

function renderEmpty() {
    return `
        <div class="catalog-empty">
            <div class="empty-pixel">◇</div>
            <h2 class="h5 mb-1">Nenhum produto encontrado</h2>
            <div class="text-secondary mb-3">Tente outro filtro ou cadastre um novo item.</div>
            <a class="btn catalog-new-empty" href="/produtos/novo">Novo produto</a>
        </div>
    `;
}

function renderMetrics() {
    const metrics = [
        { label: "Total de produtos", value: products.length, icon: "▦" },
        { label: "Estoque baixo", value: products.filter((p) => p.status === "baixo").length, icon: "▧" },
        { label: "Unidades rastreáveis", value: products.filter((p) => p.tipo_controle === "unidade").length, icon: "◇" },
        { label: "Localizações ativas", value: activeLocationsCount, icon: "⌁" },
    ];
    byId("catalogMetrics").innerHTML = metrics.map((metric) => `
        <div class="catalog-metric">
            <div class="metric-pixel">${metric.icon}</div>
            <div>
                <div class="metric-value">${metric.value}</div>
                <div class="metric-label">${escapeHtml(metric.label)}</div>
            </div>
        </div>
    `).join("");
}

function renderCard(produto) {
    const status = statusMeta(produto.status);
    const location = produto.localizacao_label || friendlyLocation(produto);
    return `
        <article class="product-card ${status.cls}">
            <div class="product-card-top">
                <div class="pixel-icon" aria-hidden="true">${productIcon(produto)}</div>
                <div class="product-badges">${categoryBadge(produto)}${controlBadge(produto)}</div>
            </div>
            <div class="product-card-body">
                <h2 class="product-name">${escapeHtml(produto.nome)}</h2>
                <div class="product-model">${escapeHtml(produto.modelo || "Modelo não informado")}</div>
                <div class="product-codes">
                    <span>${escapeHtml(produto.codigo)}</span>
                    ${produto.codigo_barras ? `<span>${escapeHtml(produto.codigo_barras)}</span>` : ""}
                </div>
                <div class="product-location">${escapeHtml(location)}</div>
            </div>
            <div class="stock-strip">
                <div><span class="stock-number">${produto.quantidade_atual}</span><span class="stock-label"> atual</span></div>
                <div><span class="stock-min">${produto.estoque_minimo}</span><span class="stock-label"> mínimo</span></div>
                <span class="stock-status">${status.label}</span>
            </div>
            <div class="product-actions">
                <a class="btn btn-primary btn-sm" href="/produtos/${encodeURIComponent(produto.codigo)}">Ver produto</a>
                <a class="btn btn-outline-success btn-sm" href="${movementLink(produto, "entrada")}">Entrada</a>
                <a class="btn btn-outline-danger btn-sm" href="${movementLink(produto, "retirada")}">Retirada</a>
            </div>
        </article>
    `;
}

function renderProducts() {
    const visible = products.filter(productMatchesFilter);
    byId("productCount").textContent = visible.length;
    renderMetrics();
    byId("productGrid").innerHTML = visible.length ? visible.map(renderCard).join("") : renderEmpty();
}

async function loadProducts(query = "") {
    const { data } = await Api.get(`/api/produtos${query ? `?q=${encodeURIComponent(query)}` : ""}`);
    products = data.produtos;
    renderProducts();
}

(async function init() {
    await requireAuth();
    try {
        const { data } = await Api.get("/api/localizacoes");
        activeLocationsCount = data.localizacoes.length;
    } catch (_error) {
        activeLocationsCount = 0;
    }
    await loadProducts();
    const toast = sessionStorage.getItem("productToast");
    if (toast) {
        sessionStorage.removeItem("productToast");
        setAlert(toast);
    }

    byId("searchForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        await loadProducts(new FormData(event.currentTarget).get("q"));
    });

    byId("clearSearch").addEventListener("click", async () => {
        byId("searchForm").reset();
        await loadProducts();
    });

    byId("filterChips").addEventListener("click", (event) => {
        const chip = event.target.closest("[data-filter]");
        if (!chip) return;
        activeFilter = chip.dataset.filter;
        byId("filterChips").querySelectorAll("[data-filter]").forEach((item) => {
            item.classList.toggle("active", item === chip);
        });
        renderProducts();
    });
})();
