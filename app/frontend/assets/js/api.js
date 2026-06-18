const Api = (() => {
    async function request(path, options = {}) {
        const init = {
            credentials: "same-origin",
            headers: {},
            ...options,
        };
        if (init.body && !(init.body instanceof FormData)) {
            init.headers["Content-Type"] = "application/json";
            init.body = JSON.stringify(init.body);
        }
        const response = await fetch(path, init);
        const payload = await response.json().catch(() => ({ ok: false, error: "Resposta inválida do servidor." }));
        if (!response.ok || !payload.ok) {
            const error = new Error(payload.error || "Operação não concluída.");
            error.status = response.status;
            error.details = payload.details;
            throw error;
        }
        return payload;
    }

    return {
        get: (path) => request(path),
        post: (path, body) => request(path, { method: "POST", body }),
        put: (path, body) => request(path, { method: "PUT", body }),
        delete: (path) => request(path, { method: "DELETE" }),
        upload: (path, formData) => request(path, { method: "POST", body: formData }),
    };
})();

function byId(id) {
    return document.getElementById(id);
}

function formDataObject(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    Object.keys(data).forEach((key) => {
        if (data[key] === "") data[key] = null;
    });
    return data;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function setAlert(message, type = "success", targetId = "alert") {
    const target = byId(targetId);
    if (!target) return;
    target.innerHTML = `<div class="alert alert-${type} alert-dismissible fade show" role="alert">
        ${escapeHtml(message)}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Fechar"></button>
    </div>`;
}

function statusBadge(status) {
    const label = { ok: "Ok", baixo: "Baixo", zerado: "Zerado" }[status] || status || "Ok";
    const cls = { ok: "success", baixo: "warning text-dark", zerado: "danger" }[status] || "secondary";
    return `<span class="badge bg-${cls}">${label}</span>`;
}

function friendlyArmario(value) {
    const text = String(value || "");
    const match = text.match(/^ARM0?(\d+)$/i);
    return match ? `Armário ${match[1].padStart(2, "0")}` : text;
}

function friendlyLocation(loc) {
    if (!loc) return "";
    const nome = loc.nome || loc.localizacao_nome || "";
    return `${friendlyArmario(loc.armario)} > ${loc.prateleira} > ${nome}`;
}

function sortLocations(locations) {
    return [...locations].sort((a, b) =>
        String(a.armario || "").localeCompare(String(b.armario || ""), "pt-BR", { numeric: true }) ||
        String(a.prateleira || "").localeCompare(String(b.prateleira || ""), "pt-BR", { numeric: true }) ||
        String(a.nome || a.localizacao_nome || "").localeCompare(String(b.nome || b.localizacao_nome || ""), "pt-BR", { numeric: true })
    );
}

function formatDate(value) {
    if (!value) return "-";
    return new Date(`${value}Z`).toLocaleString("pt-BR");
}

function pageCodeFromPath() {
    return decodeURIComponent(window.location.pathname.split("/").filter(Boolean).pop() || "");
}

async function requireAuth() {
    try {
        const { data } = await Api.get("/api/auth/me");
        const userLabel = byId("userLabel");
        if (userLabel) userLabel.textContent = data.user.nome || data.user.username;
        return data.user;
    } catch (error) {
        if (window.location.pathname !== "/login") window.location.href = "/login";
        throw error;
    }
}

function mountNav(active) {
    const nav = byId("appNav");
    if (!nav) return;
    const items = [
        ["dashboard", "/dashboard", "Dashboard"],
        ["produtos", "/produtos", "Produtos"],
        ["localizacoes", "/localizacoes", "Localizações"],
        ["etiquetas", "/etiquetas", "Etiquetas"],
        ["movimentacoes", "/movimentacoes", "Movimentações"],
        ["emprestimos", "/emprestimos", "Empréstimos"],
        ["scanner", "/scanner", "Scanner"],
        ["importacao", "/importacao", "Importação"],
    ];
    nav.innerHTML = items.map(([key, href, label]) =>
        `<a class="nav-link ${key === active ? "active" : ""}" href="${href}">${label}</a>`
    ).join("");
}

async function logout() {
    await Api.post("/api/auth/logout", {});
    window.location.href = "/login";
}

document.addEventListener("click", (event) => {
    if (event.target.matches("[data-logout]")) {
        event.preventDefault();
        logout();
    }
});
