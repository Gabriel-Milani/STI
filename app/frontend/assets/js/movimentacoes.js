mountNav("movimentacoes");

(async function init() {
    await requireAuth();
    try {
        const { data } = await Api.get("/api/movimentacoes?limit=100");
        byId("movementRows").innerHTML = data.movimentacoes.map((mov) => `
            <tr>
                <td>${formatDate(mov.data_hora)}</td>
                <td><a href="/produtos/${encodeURIComponent(mov.produto_codigo)}">${escapeHtml(mov.produto_nome)}</a><div class="small text-secondary">${escapeHtml(mov.produto_codigo)}</div></td>
                <td>${escapeHtml(mov.tipo)}</td>
                <td>${escapeHtml([mov.responsavel_origem, mov.responsavel_destino].filter(Boolean).join(" > ") || "-")}</td>
                <td class="text-end">${mov.quantidade}</td>
            </tr>
        `).join("") || `<tr><td colspan="5" class="text-secondary">Sem movimentações.</td></tr>`;
    } catch (error) {
        setAlert(error.message, "danger");
    }
})();
