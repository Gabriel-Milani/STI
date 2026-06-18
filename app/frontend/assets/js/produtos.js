mountNav("produtos");

async function loadProducts(query = "") {
    const { data } = await Api.get(`/api/produtos${query ? `?q=${encodeURIComponent(query)}` : ""}`);
    byId("productRows").innerHTML = data.produtos.map((produto) => `
        <tr>
            <td><a href="/produtos/${encodeURIComponent(produto.codigo)}" class="fw-semibold text-decoration-none">${escapeHtml(produto.nome)}</a><div class="small text-secondary">${escapeHtml(produto.codigo)}</div></td>
            <td>${escapeHtml(friendlyLocation(produto))}</td>
            <td>${statusBadge(produto.status)}</td>
            <td class="text-end">${produto.quantidade_atual}</td>
        </tr>
    `).join("") || `<tr><td colspan="4" class="text-secondary">Nenhum produto encontrado.</td></tr>`;
}

(async function init() {
    await requireAuth();
    await loadProducts();

    byId("searchForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        await loadProducts(new FormData(event.currentTarget).get("q"));
    });
})();
