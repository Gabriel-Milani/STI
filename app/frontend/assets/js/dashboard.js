mountNav("dashboard");

const typeLabels = {
    entrada: "Entrada de produto",
    retirada: "Retirada de produto",
    emprestimo: "Empréstimo",
    devolucao: "Devolução",
    descarte: "Descarte",
    mover: "Mover localização",
};

const typeClasses = {
    entrada: "move-in",
    retirada: "move-out",
    emprestimo: "move-loan",
    devolucao: "move-return",
    descarte: "move-discard",
    mover: "move-map",
};

function formatNumber(value) {
    return Number(value || 0).toLocaleString("pt-BR");
}

function movementWhen(value) {
    if (!value) return "";
    const date = new Date(`${value}Z`);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const sameDay = (a, b) => a.toDateString() === b.toDateString();
    const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    if (sameDay(date, today)) return `Hoje, ${time}`;
    if (sameDay(date, yesterday)) return `Ontem, ${time}`;
    return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function renderMetrics(resumo) {
    const trackedPercent = resumo.unidades_em_estoque
        ? Math.min(100, Math.round((resumo.unidades_rastreaveis / resumo.unidades_em_estoque) * 100))
        : 0;
    const metrics = [
        {
            label: "Total de produtos",
            value: resumo.total_produtos,
            detail: "Cadastrados ativos",
            icon: "box",
            tone: "teal",
        },
        {
            label: "Estoque baixo",
            value: resumo.produtos_abaixo_minimo,
            detail: "Requer atenção •",
            icon: "warn",
            tone: "amber",
        },
        {
            label: "Unidades rastreáveis",
            value: resumo.unidades_rastreaveis,
            detail: `${trackedPercent}% do total`,
            icon: "target",
            tone: "cyan",
            progress: trackedPercent,
        },
        {
            label: "Localizações ativas",
            value: resumo.localizacoes_ativas,
            detail: "Áreas cadastradas",
            icon: "pin",
            tone: "blue",
        },
        {
            label: "Empréstimos abertos",
            value: resumo.emprestimos_abertos,
            detail: "Em andamento •",
            icon: "emprestimos",
            iconBase: "dashboard",
            tone: "purple",
        },
    ];

    byId("metrics").innerHTML = metrics.map((item) => `
        <article class="dashboard-metric metric-tone-${item.tone}">
            <div class="metric-pixel" aria-hidden="true">
                <img class="pixel-asset-img" src="/assets/img/pixel-ops/${item.iconBase || "metrics"}/${item.icon}.webp" alt="" loading="lazy" decoding="async" onload="this.parentElement.classList.add('has-asset')" onerror="this.remove()">
                <span></span>
            </div>
            <div class="dashboard-metric-body">
                <div class="metric-label">${escapeHtml(item.label)}</div>
                <div class="metric-value">${formatNumber(item.value)}</div>
                <div class="metric-detail">${escapeHtml(item.detail)}</div>
                ${item.progress !== undefined ? `<div class="mini-progress"><span style="width: ${item.progress}%"></span></div>` : ""}
            </div>
        </article>
    `).join("");
}

function renderCritical(rows) {
    byId("criticalRows").innerHTML = rows.map((item) => {
        const icon = productIconName(item);
        return `
            <a class="low-stock-item" href="/produtos/${encodeURIComponent(item.codigo)}">
                <span class="item-thumb">
                    <img class="pixel-asset-img" src="/assets/img/pixel-ops/products/${icon}.webp" alt="" loading="lazy" decoding="async" onload="this.parentElement.classList.add('has-asset')" onerror="this.remove()">
                </span>
                <span class="item-main">
                    <strong>${escapeHtml(item.nome)}</strong>
                    <small>${escapeHtml(item.modelo || item.categoria || "Sem modelo")}</small>
                </span>
                <span class="item-place">${escapeHtml(item.armario)} &gt; ${escapeHtml(item.prateleira)}</span>
                <span class="item-qty">${formatNumber(item.quantidade_atual)} unid.<small>Mín: ${formatNumber(item.estoque_minimo)}</small></span>
            </a>
        `;
    }).join("") || `<div class="dashboard-empty">Nenhum item crítico.</div>`;
}

function renderMovements(rows) {
    byId("movementRows").innerHTML = rows.slice(0, 5).map((item) => {
        const label = typeLabels[item.tipo] || item.tipo;
        const cls = typeClasses[item.tipo] || "move-map";
        const userName = item.usuario_nome || item.usuario_username || "Admin";
        const user = userName.toLowerCase() === "administrador" ? "Admin" : userName;
        return `
            <a class="movement-item" href="/produtos/${encodeURIComponent(item.produto_codigo)}">
                <span class="movement-icon ${cls}">${item.tipo === "entrada" ? "↓" : item.tipo === "retirada" ? "↑" : item.tipo === "emprestimo" ? "♟" : item.tipo === "descarte" ? "⌫" : "↔"}</span>
                <span class="movement-main">
                    <strong>${escapeHtml(label)}</strong>
                    <small>${escapeHtml(item.produto_nome)}</small>
                </span>
                <span class="movement-meta">${escapeHtml(movementWhen(item.data_hora))}<small>por ${escapeHtml(user)}</small></span>
            </a>
        `;
    }).join("") || `<div class="dashboard-empty">Sem movimentações.</div>`;
}

function renderChart(rows) {
    const labels = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
    const keys = Array.from({ length: 7 }, (_, index) => {
        const date = new Date();
        date.setDate(date.getDate() - (6 - index));
        return date.toISOString().slice(0, 10);
    });
    const plot = { x: 34, y: 12, w: 466, h: 174 };
    const definitions = [
        ["entrada", "#35d28f"],
        ["retirada", "#ef5864"],
        ["emprestimo", "#5a8cff"],
        ["devolucao", "#9278c9"],
    ];
    const series = definitions.map(([tipo, color]) => ({
        color,
        values: keys.map((key) => {
            const row = rows.find((item) => item.dia === key && item.tipo === tipo);
            return Math.min(100, Number(row ? row.total : 0));
        }),
    }));
    const xFor = (index) => plot.x + (index * plot.w / 6);
    const yFor = (value) => plot.y + plot.h - (value / 100) * plot.h;
    const pointsFor = (values) => values.map((value, index) => `${xFor(index)},${yFor(value)}`).join(" ");
    const circlesFor = (values, color) => values.map((value, index) =>
        `<circle cx="${xFor(index)}" cy="${yFor(value)}" r="4" fill="${color}" stroke="#dffcff" stroke-width="2"></circle>`
    ).join("");

    byId("weekChart").innerHTML = `
        <svg viewBox="0 0 510 220" role="img" aria-label="Movimentações dos últimos sete dias">
            <defs>
                <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#18b48a" stop-opacity=".28"></stop>
                    <stop offset="100%" stop-color="#0b1626" stop-opacity=".02"></stop>
                </linearGradient>
            </defs>
            <rect class="chart-plot" x="${plot.x}" y="${plot.y}" width="${plot.w}" height="${plot.h}" rx="2"></rect>
            ${[0, 20, 40, 60, 80, 100].map((value) => {
                const y = yFor(value);
                return `<text class="chart-y-label" x="24" y="${y + 4}" text-anchor="end">${value}</text><line x1="${plot.x}" x2="${plot.x + plot.w}" y1="${y}" y2="${y}" class="chart-grid"></line>`;
            }).join("")}
            ${labels.map((_, index) => {
                const x = xFor(index);
                return `<line x1="${x}" x2="${x}" y1="${plot.y}" y2="${plot.y + plot.h}" class="chart-grid soft"></line>`;
            }).join("")}
            <polygon points="${plot.x},${plot.y + plot.h} ${pointsFor(series[0].values)} ${plot.x + plot.w},${plot.y + plot.h}" fill="url(#chartFill)"></polygon>
            ${series.map((item) => `<polyline points="${pointsFor(item.values)}" fill="none" stroke="${item.color}" stroke-width="3"></polyline>${circlesFor(item.values, item.color)}`).join("")}
            ${labels.map((label, index) => `<text class="chart-x-label" x="${xFor(index)}" y="209" text-anchor="middle">${label}</text>`).join("")}
        </svg>
    `;
}

function renderLocations(rows) {
    const max = Math.max(1, ...rows.map((item) => Number(item.movimentacoes_count || item.unidades_total || 0)));
    byId("locationRows").innerHTML = rows.map((item) => {
        const count = Number(item.movimentacoes_count || item.unidades_total || 0);
        const pct = Math.max(8, Math.round((count / max) * 100));
        return `
            <div class="location-usage-item">
                <div><strong>${escapeHtml(item.armario)} &gt; ${escapeHtml(item.prateleira)}</strong><small>${formatNumber(count)} movimentações</small></div>
                <div class="usage-line"><span style="width: ${pct}%"></span></div>
                <b>${pct}%</b>
            </div>
        `;
    }).join("") || `<div class="dashboard-empty">Sem localizações ativas.</div>`;
}

function renderMap(rows) {
    const byCabinet = Object.fromEntries(rows.map((item) => [item.armario || "OUTROS", item]));
    const tiles = ["ARM01", "ARM02", "ARM03", "OUTROS"].map((key) => {
        const item = byCabinet[key] || { armario: key, localizacoes_count: 0 };
        return { key, count: Number(item.localizacoes_count || 0), label: key === "OUTROS" ? "Áreas" : "Estantes" };
    });
    byId("mapRows").innerHTML = tiles.map((item, index) => `
        <a class="map-tile map-tone-${index}" href="/localizacoes">
            <img class="map-icon-img" src="/assets/img/pixel-ops/dashboard/${item.key}.webp" alt="" loading="lazy" decoding="async">
            <span><strong>${escapeHtml(item.key)}</strong><small>${escapeHtml(item.label)}</small><em>${formatNumber(item.count)} ativas</em></span>
        </a>
    `).join("");
}

(async function init() {
    try {
        const [, { data }] = await Promise.all([
            requireAuth(),
            Api.get("/api/dashboard"),
        ]);
        renderMetrics(data.resumo);
        renderCritical(data.estoque_critico);
        renderMovements(data.ultimas_movimentacoes);
        renderChart(data.movimentacoes_semana);
        renderLocations(data.localizacoes_mais_usadas);
        renderMap(data.mapa_operacional);
    } catch (error) {
        setAlert(error.message, "danger");
    }
})();
