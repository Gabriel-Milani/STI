mountNav("produtos");

let products = [];
let activeFilter = "todos";
let activeLocationsCount = 0;

function pixelImg(src, alt = "") {
    return `<img class="pixel-asset-img" src="${src}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async" onload="this.parentElement.classList.add('has-asset')" onerror="this.remove()">`;
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
        ok: { label: "OK", cls: "status-ok-card", icon: "▣" },
        baixo: { label: "BAIXO", cls: "status-low-card", icon: "⚠" },
        zerado: { label: "ZERADO", cls: "status-zero-card", icon: "⊘" },
    }[status] || { label: "OK", cls: "status-ok-card", icon: "▣" };
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
            <div class="empty-terminal">
                <div class="empty-face">▣</div>
            </div>
            <h2 class="h5 mb-1">Nenhum produto encontrado</h2>
            <div class="text-secondary mb-3">Tente outro filtro ou cadastre um novo item no catálogo STI.</div>
            <a class="btn catalog-new-empty" href="/produtos/novo">＋ Novo produto</a>
        </div>
    `;
}

function renderMetrics() {
    const metrics = [
        { label: "Total de produtos", value: products.length, icon: "box" },
        { label: "Estoque baixo", value: products.filter((p) => p.status === "baixo").length, icon: "warn" },
        { label: "Unidades rastreáveis", value: products.filter((p) => p.tipo_controle === "unidade").length, icon: "target" },
        { label: "Localizações ativas", value: activeLocationsCount, icon: "pin" },
    ];
    byId("catalogMetrics").innerHTML = metrics.map((metric) => `
        <article class="catalog-metric metric-${metric.icon}">
            <div class="metric-pixel" aria-hidden="true">
                ${pixelImg(`/assets/img/pixel-ops/metrics/${metric.icon}.webp`)}
                <span></span>
            </div>
            <div>
                <div class="metric-label">${escapeHtml(metric.label)}</div>
                <div class="metric-value">${metric.value}</div>
            </div>
        </article>
    `).join("") + `<div class="grid-ok-chip">${pixelImg("/assets/img/pixel-ops/ui/grid-ok.webp")}<span>GRID</span><strong>OK</strong></div>`;
}

function renderCard(produto) {
    const status = statusMeta(produto.status);
    const location = produto.localizacao_label || friendlyLocation(produto);
    const barcode = produto.codigo_barras || "Sem código";
    const canEnter = produto.status !== "zerado" || true;
    const icon = productIconName(produto);
    return `
        <article class="product-card ${status.cls}">
            <div class="product-card-top">
                <div class="pixel-product-icon pixel-${icon}" aria-hidden="true">
                    ${pixelImg(`/assets/img/pixel-ops/products/${icon}.webp`)}
                    <span></span>
                </div>
                <div class="product-badges">${categoryBadge(produto)}${controlBadge(produto)}</div>
            </div>

            <div class="product-card-body">
                <h2 class="product-name">${escapeHtml(produto.nome)}</h2>
                <div class="product-model">Modelo: ${escapeHtml(produto.modelo || "Não informado")}</div>

                <div class="product-codes">
                    <div class="code-cell">
                        <span>Código int.</span>
                        <strong>${escapeHtml(produto.codigo)}</strong>
                    </div>
                    <div class="code-cell barcode-cell">
                        <span>Cód. barras</span>
                        <strong>${escapeHtml(barcode)}</strong>
                        <i class="fake-barcode"></i>
                    </div>
                </div>

                <div class="product-location">Localização: ${escapeHtml(location)}</div>
            </div>

            <div class="stock-strip">
                <div class="stock-info"><span class="stock-label">Atual</span><strong>${produto.quantidade_atual}</strong></div>
                <div class="stock-info"><span class="stock-label">Mínimo</span><strong>${produto.estoque_minimo}</strong></div>
                <div class="stock-info status-box"><span class="stock-label">Status</span><strong>${status.label}</strong></div>
            </div>

            <div class="product-actions">
                <a class="btn action-view" href="/produtos/${encodeURIComponent(produto.codigo)}">Ver produto</a>
                <a class="btn action-entry ${canEnter ? "" : "disabled"}" href="${movementLink(produto, "entrada")}">↓ Entrada</a>
                <a class="btn action-exit" href="${movementLink(produto, "retirada")}">↑ Retirada</a>
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
    try {
        const [, locationsResponse, productsResponse] = await Promise.all([
            requireAuth(),
            Api.get("/api/localizacoes").catch(() => null),
            Api.get("/api/produtos"),
        ]);
        activeLocationsCount = locationsResponse ? locationsResponse.data.localizacoes.length : 0;
        products = productsResponse.data.produtos;
        renderProducts();
    } catch (error) {
        activeLocationsCount = 0;
        setAlert(error.message, "danger");
    }
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
