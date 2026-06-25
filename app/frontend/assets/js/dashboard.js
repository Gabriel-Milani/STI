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

function renderDashboardLoading() {
    byId("metrics").innerHTML = Array.from({ length: 4 }).map(() => `
        <article class="dashboard-metric ops-skeleton-card">
            <span class="ops-skeleton-icon"></span>
            <div class="dashboard-metric-body w-100">
                <span class="ops-skeleton-line short"></span>
                <span class="ops-skeleton-line title"></span>
                <span class="ops-skeleton-line"></span>
            </div>
        </article>
    `).join("");
    byId("weekChart").innerHTML = `
        <div class="dashboard-chart-loading ops-skeleton-card">
            <span class="ops-skeleton-line short"></span>
            <span class="ops-skeleton-line title"></span>
            <span class="ops-skeleton-line"></span>
        </div>
    `;
    ["criticalRows", "movementRows", "locationRows", "mapRows"].forEach((id) => {
        byId(id).innerHTML = Array.from({ length: 4 }).map(() => `
            <div class="dashboard-list-loading ops-skeleton-card">
                <span class="ops-skeleton-icon"></span>
                <span class="ops-skeleton-line"></span>
            </div>
        `).join("");
    });
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
    }).join("") || `<div class="dashboard-empty ops-empty-state">Nenhum item crítico.</div>`;
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
    }).join("") || `<div class="dashboard-empty ops-empty-state">Sem movimentações.</div>`;
}

function renderChart(rows) {
    const safeRows = rows && rows.length ? rows : [];
    const definitions = [
        ["entrada", "Entradas", "#35d28f"],
        ["retirada", "Saídas", "#ef5864"],
        ["emprestimo", "Empréstimos", "#5a8cff"],
        ["devolucao", "Devoluções", "#9278c9"],
    ];
    const maxValue = Math.max(0, ...safeRows.flatMap((row) => definitions.map(([key]) => Number(row[key] || 0))));
    const niceMax = Math.max(1, Math.ceil(maxValue / 5) * 5);
    const totalWeek = safeRows.reduce((sum, row) => sum + Number(row.total || 0), 0);
    const plot = { x: 44, y: 14, w: 520, h: 154 };
    const ticks = [0, .25, .5, .75, 1].map((ratio) => Math.round(niceMax * ratio));
    const dayGap = plot.w / Math.max(1, safeRows.length);
    const groupWidth = Math.min(46, dayGap * .58);
    const barGap = 3;
    const barWidth = (groupWidth - barGap * (definitions.length - 1)) / definitions.length;
    const yFor = (value) => plot.y + plot.h - (Number(value || 0) / niceMax) * plot.h;

    if (!safeRows.length) {
        byId("weekChart").innerHTML = `<div class="chart-empty ops-empty-state">Sem dados para montar o gráfico.</div>`;
        return;
    }

    const bars = safeRows.map((row, dayIndex) => {
        const groupX = plot.x + dayIndex * dayGap + (dayGap - groupWidth) / 2;
        return definitions.map(([key, label, color], typeIndex) => {
            const value = Number(row[key] || 0);
            const height = Math.max(value > 0 ? 3 : 0, plot.y + plot.h - yFor(value));
            const x = groupX + typeIndex * (barWidth + barGap);
            const y = plot.y + plot.h - height;
            return `
                <rect class="chart-bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${height.toFixed(1)}" rx="2" fill="${color}">
                    <title>${escapeHtml(row.label)} ${escapeHtml(row.data_label)} · ${escapeHtml(label)}: ${formatNumber(value)}</title>
                </rect>
            `;
        }).join("");
    }).join("");

    byId("weekChart").innerHTML = `
        <div class="chart-summary">
            <strong>${formatNumber(totalWeek)}</strong>
            <span>movimentações nos últimos 7 dias</span>
        </div>
        <svg viewBox="0 0 590 202" role="img" aria-label="Movimentações dos últimos sete dias">
            <defs>
                <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#10223a" stop-opacity="1"></stop>
                    <stop offset="100%" stop-color="#091522" stop-opacity="1"></stop>
                </linearGradient>
            </defs>
            <rect class="chart-plot" x="${plot.x}" y="${plot.y}" width="${plot.w}" height="${plot.h}" rx="2"></rect>
            ${ticks.map((value) => {
                const y = yFor(value);
                return `<text class="chart-y-label" x="24" y="${y + 4}" text-anchor="end">${value}</text><line x1="${plot.x}" x2="${plot.x + plot.w}" y1="${y}" y2="${y}" class="chart-grid"></line>`;
            }).join("")}
            ${safeRows.map((_, index) => {
                const x = plot.x + index * dayGap + dayGap / 2;
                return `<line x1="${x}" x2="${x}" y1="${plot.y}" y2="${plot.y + plot.h}" class="chart-grid soft"></line>`;
            }).join("")}
            ${bars}
            ${safeRows.map((row, index) => {
                const x = plot.x + index * dayGap + dayGap / 2;
                return `
                    <text class="chart-x-label" x="${x}" y="190" text-anchor="middle">${escapeHtml(row.label)} ${escapeHtml(row.data_label)}</text>
                `;
            }).join("")}
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
    }).join("") || `<div class="dashboard-empty ops-empty-state">Sem localizações ativas.</div>`;
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
        renderDashboardLoading();
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
