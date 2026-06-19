mountNav("scanner");

function renderProduct(produto) {
    return `
        <div class="card shadow-sm"><div class="card-body">
            <div class="d-flex flex-wrap justify-content-between gap-3">
                <div>
                    <h2 class="h4 mb-1"><a href="/produtos/${encodeURIComponent(produto.codigo)}">${escapeHtml(produto.nome)}</a></h2>
                    <div class="text-secondary">${escapeHtml(produto.codigo)} · ${escapeHtml(produto.localizacao_label)}</div>
                </div>
                <div class="text-end"><div class="fs-3 fw-semibold">${produto.quantidade_atual}</div><div class="text-secondary small">unidades</div></div>
            </div>
        </div></div>`;
}

function renderLocation(localizacao, produtos) {
    return `
        <div class="card shadow-sm"><div class="card-body">
            <h2 class="h4 mb-1">${escapeHtml(localizacao.nome)}</h2>
            <div class="text-secondary mb-3">${escapeHtml(localizacao.armario)} > ${escapeHtml(localizacao.prateleira)} · ${escapeHtml(localizacao.codigo)}</div>
            <div class="table-responsive"><table class="table table-sm mb-0"><thead><tr><th>Produto</th><th class="text-end">Qtd.</th></tr></thead><tbody>
                ${produtos.map((p) => `<tr><td><a href="/produtos/${encodeURIComponent(p.codigo)}">${escapeHtml(p.nome)}</a></td><td class="text-end">${p.quantidade_atual}</td></tr>`).join("") || `<tr><td colspan="2" class="text-secondary">Sem produtos.</td></tr>`}
            </tbody></table></div>
        </div></div>`;
}

function renderUnit(unidade) {
    return `
        <div class="card shadow-sm"><div class="card-body">
            <div class="d-flex flex-wrap justify-content-between gap-3">
                <div>
                    <h2 class="h4 mb-1"><a href="/produtos/${encodeURIComponent(unidade.produto_codigo)}">${escapeHtml(unidade.produto_nome)}</a></h2>
                    <div class="text-secondary">${escapeHtml(unidade.codigo_unidade)} · ${escapeHtml(unidade.localizacao_label)}</div>
                </div>
                <div class="text-end"><div class="badge bg-secondary fs-6">${escapeHtml(unidade.status)}</div><div class="text-secondary small mt-2">unidade rastreável</div></div>
            </div>
        </div></div>`;
}

(async function init() {
    await requireAuth();
    byId("scanForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        const codigo = new FormData(event.currentTarget).get("codigo");
        try {
            const { data } = await Api.get(`/api/scanner/buscar/${encodeURIComponent(codigo)}`);
            byId("scanResult").innerHTML = data.tipo === "produto"
                ? renderProduct(data.produto)
                : data.tipo === "unidade"
                    ? renderUnit(data.unidade)
                    : renderLocation(data.localizacao, data.produtos);
        } catch (error) {
            byId("scanResult").innerHTML = "";
            setAlert(error.message, "danger");
        }
    });
})();
