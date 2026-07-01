mountNav("produtos");

let products = [];
let locations = [];
let categories = [];
let activeFilter = "todos";
let activeLocationsCount = 0;
let searchTerm = "";
let activeCategory = "";
let activeLocation = "";
let sortMode = "nome";

function pixelImg(src, alt = "") {
    return `<img class="pixel-asset-img" src="${src}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async" onload="this.parentElement.classList.add('has-asset')" onerror="this.remove()">`;
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
    const text = [
        produto.nome,
        produto.modelo,
        produto.codigo,
        produto.codigo_barras,
        produto.categoria,
        produto.localizacao_label,
        produto.localizacao_nome,
    ].filter(Boolean).join(" ").toLowerCase();
    if (searchTerm && !text.includes(searchTerm)) return false;
    if (activeCategory && String(produto.categoria || "") !== activeCategory) return false;
    if (activeLocation && String(produto.localizacao_codigo || "") !== activeLocation) return false;
    if (activeFilter === "baixo") return produto.status === "baixo";
    if (activeFilter === "zerado") return produto.status === "zerado";
    return true;
}

function sortProducts(rows) {
    const collator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });
    return [...rows].sort((a, b) => {
        if (sortMode === "estoque-asc") return Number(a.quantidade_atual || 0) - Number(b.quantidade_atual || 0);
        if (sortMode === "estoque-desc") return Number(b.quantidade_atual || 0) - Number(a.quantidade_atual || 0);
        if (sortMode === "categoria") return collator.compare(a.categoria || "", b.categoria || "") || collator.compare(a.nome || "", b.nome || "");
        return collator.compare(a.nome || "", b.nome || "");
    });
}

function movementLink(produto, type) {
    return `/produtos/${encodeURIComponent(produto.codigo)}?acao=${encodeURIComponent(type)}`;
}

function renderEmpty() {
    return `
        <div class="catalog-empty ops-empty-state">
            <div class="empty-terminal">
                <div class="empty-face">▣</div>
            </div>
            <h2 class="h5 mb-1">Nenhum produto encontrado</h2>
            <div class="text-secondary mb-3">Tente outro filtro ou cadastre um novo item no catálogo STI.</div>
            <a class="btn catalog-new-empty" href="/produtos/novo">＋ Novo produto</a>
        </div>
    `;
}

function renderLoading() {
    byId("productGrid").innerHTML = Array.from({ length: 6 }).map(() => `
        <article class="product-card product-card-loading ops-skeleton-card">
            <span class="ops-skeleton-line short"></span>
            <span class="ops-skeleton-line title"></span>
            <span class="ops-skeleton-line"></span>
            <span class="ops-skeleton-line"></span>
        </article>
    `).join("");
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
                <div class="product-card-heading">
                    <div class="product-badges">${categoryBadge(produto)}</div>
                    <h2 class="product-name">${escapeHtml(produto.nome)}</h2>
                    <div class="product-model">Modelo: ${escapeHtml(produto.modelo || "Não informado")}</div>
                </div>
            </div>

            <div class="product-card-body">
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

                <div class="product-location">
                    <span>Localização</span>
                    <strong>${escapeHtml(location)}</strong>
                </div>
            </div>

            <div class="stock-strip">
                <div class="stock-info stock-current"><span class="stock-label">Atual</span><strong>${produto.quantidade_atual}</strong></div>
                <div class="stock-info stock-minimum"><span class="stock-label">Mínimo</span><strong>${produto.estoque_minimo}</strong></div>
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
    const visible = sortProducts(products.filter(productMatchesFilter));
    byId("productCount").textContent = visible.length;
    byId("productGrid").innerHTML = visible.length ? visible.map(renderCard).join("") : renderEmpty();
}

function populateFilters() {
    const categorySelect = byId("categoryFilter");
    const locationSelect = byId("locationFilter");
    if (categorySelect) {
        const values = categories.length
            ? categories
            : [...new Set(products.map((produto) => produto.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
        categorySelect.innerHTML = `<option value="">Todas as categorias</option>` + values.map((categoria) =>
            `<option value="${escapeHtml(categoria)}">${escapeHtml(categoria)}</option>`
        ).join("");
        categorySelect.value = activeCategory;
    }
    if (locationSelect) {
        locationSelect.innerHTML = `<option value="">Todas as localizações</option>` + locations.map((loc) =>
            `<option value="${escapeHtml(loc.codigo)}">${escapeHtml(friendlyLocation(loc))}</option>`
        ).join("");
        locationSelect.value = activeLocation;
    }
}

function applyUrlFilters() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("baixo") === "1") activeFilter = "baixo";
    if (params.get("zerado") === "1") activeFilter = "zerado";
    byId("filterChips").querySelectorAll("[data-filter]").forEach((chip) => {
        chip.classList.toggle("active", chip.dataset.filter === activeFilter);
    });
}

(async function init() {
    try {
        renderLoading();
        applyUrlFilters();
        const [, locationsResponse, categoriesResponse, productsResponse] = await Promise.all([
            requireAuth(),
            Api.get("/api/localizacoes").catch(() => null),
            Api.get("/api/produtos/categorias").catch(() => null),
            Api.get("/api/produtos"),
        ]);
        locations = locationsResponse ? sortLocations(locationsResponse.data.localizacoes) : [];
        categories = categoriesResponse ? categoriesResponse.data.categorias || [] : [];
        activeLocationsCount = locations.length;
        products = productsResponse.data.produtos;
        populateFilters();
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
        searchTerm = String(new FormData(event.currentTarget).get("q") || "").trim().toLowerCase();
        renderProducts();
    });

    byId("clearSearch").addEventListener("click", () => {
        byId("searchForm").reset();
        searchTerm = "";
        activeCategory = "";
        activeLocation = "";
        activeFilter = "todos";
        sortMode = "nome";
        if (byId("categoryFilter")) byId("categoryFilter").value = "";
        if (byId("locationFilter")) byId("locationFilter").value = "";
        if (byId("sortFilter")) byId("sortFilter").value = "nome";
        byId("filterChips").querySelectorAll("[data-filter]").forEach((chip) => {
            chip.classList.toggle("active", chip.dataset.filter === activeFilter);
        });
        renderProducts();
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

    byId("categoryFilter")?.addEventListener("change", (event) => {
        activeCategory = event.currentTarget.value;
        renderProducts();
    });

    byId("locationFilter")?.addEventListener("change", (event) => {
        activeLocation = event.currentTarget.value;
        renderProducts();
    });

    byId("sortFilter")?.addEventListener("change", (event) => {
        sortMode = event.currentTarget.value;
        renderProducts();
    });
})();
