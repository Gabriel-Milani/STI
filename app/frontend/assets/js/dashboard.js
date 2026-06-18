mountNav("dashboard");

(async function init() {
    await requireAuth();
    try {
        const { data } = await Api.get("/api/dashboard");
        const resumo = data.resumo;
        const metrics = [
            ["Produtos", resumo.total_produtos],
            ["Unidades", resumo.unidades_em_estoque],
            ["Abaixo do mínimo", resumo.produtos_abaixo_minimo],
            ["Zerados", resumo.produtos_zerados],
            ["Empréstimos abertos", resumo.emprestimos_abertos],
        ];
        byId("metrics").innerHTML = metrics.map(([label, value]) => `
            <div class="col-6 col-xl">
                <div class="metric bg-white p-3 shadow-sm">
                    <div class="text-secondary small">${label}</div>
                    <div class="fs-3 fw-semibold">${value}</div>
                </div>
            </div>
        `).join("");
        byId("criticalRows").innerHTML = data.estoque_critico.map((item) => `
            <tr>
                <td><a href="/produtos/${encodeURIComponent(item.codigo)}">${escapeHtml(item.nome)}</a></td>
                <td>${escapeHtml(item.prateleira)} > ${escapeHtml(item.localizacao_nome)}</td>
                <td class="text-end">${item.quantidade_atual}/${item.estoque_minimo}</td>
            </tr>
        `).join("") || `<tr><td colspan="3" class="text-secondary">Nenhum item crítico.</td></tr>`;
        byId("movementRows").innerHTML = data.ultimas_movimentacoes.map((item) => `
            <tr>
                <td><a href="/produtos/${encodeURIComponent(item.produto_codigo)}">${escapeHtml(item.produto_nome)}</a></td>
                <td>${escapeHtml(item.tipo)}</td>
                <td class="text-end">${item.quantidade}</td>
            </tr>
        `).join("") || `<tr><td colspan="3" class="text-secondary">Sem movimentações.</td></tr>`;
    } catch (error) {
        setAlert(error.message, "danger");
    }
})();
