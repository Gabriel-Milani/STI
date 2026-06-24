mountNav("movimentacoes");

const movementTypeLabels = {
    entrada: "Entrada",
    retirada: "Retirada",
    emprestimo: "Empréstimo",
    devolucao: "Devolução",
    descarte: "Descarte",
    mover: "Mover",
};

function movementTypeBadge(type) {
    const key = String(type || "").toLowerCase();
    const label = movementTypeLabels[key] || type || "-";
    return `<span class="movement-type-badge movement-type-${escapeHtml(key)}">${escapeHtml(label)}</span>`;
}

(async function init() {
    await requireAuth();
    try {
        const { data } = await Api.get("/api/movimentacoes?limit=100");
        byId("movementRows").innerHTML = data.movimentacoes.map((mov) => `
            <tr>
                <td>${formatDate(mov.data_hora)}</td>
                <td><a href="/produtos/${encodeURIComponent(mov.produto_codigo)}">${escapeHtml(mov.produto_nome)}</a><div class="small text-secondary">${escapeHtml(mov.produto_codigo)}</div></td>
                <td>${movementTypeBadge(mov.tipo)}</td>
                <td>${escapeHtml([mov.responsavel_origem, mov.responsavel_destino].filter(Boolean).join(" > ") || "-")}${mov.unidades_codigos ? `<div class="small text-secondary">Unidades: ${escapeHtml(mov.unidades_codigos)}</div>` : ""}</td>
                <td>${escapeHtml(mov.usuario_nome || mov.usuario_username || "-")}</td>
                <td class="text-end">${mov.quantidade}</td>
            </tr>
        `).join("") || `<tr><td colspan="6" class="text-secondary">Sem movimentações.</td></tr>`;
    } catch (error) {
        setAlert(error.message, "danger");
    }
})();
