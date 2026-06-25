mountNav("movimentacoes");

const movementTypeLabels = {
    entrada: "Entrada",
    retirada: "Retirada",
    emprestimo: "Empréstimo",
    devolucao: "Devolução",
    descarte: "Descarte",
    mover: "Mover",
};

let movements = [];
let movementSearch = "";
let movementTypeFilter = "";

function movementTypeBadge(type) {
    const key = String(type || "").toLowerCase();
    const label = movementTypeLabels[key] || type || "-";
    return `<span class="movement-type-badge movement-type-${escapeHtml(key)}">${escapeHtml(label)}</span>`;
}

function renderMovementLoading() {
    byId("movementRows").innerHTML = Array.from({ length: 6 }).map(() => `
        <tr class="movement-loading-row">
            <td colspan="6"><span class="ops-skeleton-line"></span></td>
        </tr>
    `).join("");
}

function movementMatches(mov) {
    const text = [
        mov.produto_nome,
        mov.produto_codigo,
        mov.tipo,
        mov.responsavel_origem,
        mov.responsavel_destino,
        mov.usuario_nome,
        mov.usuario_username,
    ].filter(Boolean).join(" ").toLowerCase();
    if (movementTypeFilter && mov.tipo !== movementTypeFilter) return false;
    return !movementSearch || text.includes(movementSearch);
}

function renderMovements() {
    const visible = movements.filter(movementMatches);
    byId("movementRows").innerHTML = visible.map((mov) => `
            <tr>
                <td>${formatDate(mov.data_hora)}</td>
                <td><a href="/produtos/${encodeURIComponent(mov.produto_codigo)}">${escapeHtml(mov.produto_nome)}</a><div class="small text-secondary">${escapeHtml(mov.produto_codigo)}</div></td>
                <td>${movementTypeBadge(mov.tipo)}</td>
                <td>${escapeHtml([mov.responsavel_origem, mov.responsavel_destino].filter(Boolean).join(" > ") || "-")}</td>
                <td>${escapeHtml(mov.usuario_nome || mov.usuario_username || "-")}</td>
                <td class="text-end">${mov.quantidade}</td>
            </tr>
        `).join("") || `<tr><td colspan="6"><div class="ops-empty-state movements-empty">Nenhuma movimentação encontrada com esses filtros.</div></td></tr>`;
}

(async function init() {
    await requireAuth();
    try {
        renderMovementLoading();
        const { data } = await Api.get("/api/movimentacoes?limit=200");
        movements = data.movimentacoes;
        renderMovements();
    } catch (error) {
        setAlert(error.message, "danger");
    }

    byId("movementFilterForm")?.addEventListener("submit", (event) => {
        event.preventDefault();
        movementSearch = String(new FormData(event.currentTarget).get("q") || "").trim().toLowerCase();
        movementTypeFilter = byId("movementTypeFilter").value;
        renderMovements();
    });

    byId("movementTypeFilter")?.addEventListener("change", (event) => {
        movementTypeFilter = event.currentTarget.value;
        renderMovements();
    });

    byId("clearMovementFilters")?.addEventListener("click", () => {
        byId("movementFilterForm").reset();
        movementSearch = "";
        movementTypeFilter = "";
        renderMovements();
    });
})();
