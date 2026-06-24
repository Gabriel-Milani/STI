const Api = (() => {
    async function request(path, options = {}) {
        const init = {
            credentials: "same-origin",
            headers: {},
            ...options,
        };
        const method = String(init.method || "GET").toUpperCase();
        const csrfToken = sessionStorage.getItem(AUTH_CSRF_KEY);
        if (csrfToken && !["GET", "HEAD", "OPTIONS"].includes(method)) {
            init.headers["X-CSRF-Token"] = csrfToken;
        }
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

let currentUser = null;

const AUTH_CACHE_KEY = "estoqueTi.currentUser";
const AUTH_CSRF_KEY = "estoqueTi.csrfToken";

function cacheAuthData(data) {
    if (data.user) {
        sessionStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(data.user));
    }
    if (data.csrf_token) {
        sessionStorage.setItem(AUTH_CSRF_KEY, data.csrf_token);
    }
}

function byId(id) {
    return document.getElementById(id);
}

function formDataObject(form) {
    const target = form instanceof HTMLFormElement ? form : form?.closest?.("form");
    if (!target) {
        throw new TypeError("formDataObject precisa receber um formulário ou um elemento dentro dele.");
    }
    const data = Object.fromEntries(new FormData(target).entries());
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
    showToast(message, type);
    const target = byId(targetId);
    if (target) target.innerHTML = "";
}

function showToast(message, type = "success") {
    let container = byId("toastContainer");
    if (!container) {
        container = document.createElement("div");
        container.id = "toastContainer";
        container.className = "toast-container position-fixed top-0 end-0 p-3";
        container.style.zIndex = "1080";
        document.body.appendChild(container);
    }
    const cls = {
        success: "text-bg-success",
        danger: "text-bg-danger",
        error: "text-bg-danger",
        warning: "text-bg-warning",
        aviso: "text-bg-warning",
    }[type] || "text-bg-secondary";
    const toast = document.createElement("div");
    toast.className = `toast align-items-center border-0 ${cls}`;
    toast.setAttribute("role", "status");
    toast.innerHTML = `<div class="d-flex">
        <div class="toast-body">${escapeHtml(message)}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Fechar"></button>
    </div>`;
    container.appendChild(toast);
    const instance = bootstrap.Toast.getOrCreateInstance(toast, { delay: 3500 });
    toast.addEventListener("hidden.bs.toast", () => toast.remove());
    instance.show();
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

const PRODUCT_ICON_MAP = [
    ["limpa contato", "contact-cleaner"],
    ["pasta térmica", "thermal-paste"],
    ["pasta termica", "thermal-paste"],
    ["carregador", "charger"],
    ["toner", "toner"],
    ["unidade de imagem", "imaging-unit"],
    ["pm9500", "scanner-battery"],
    ["bateria", "battery"],
    ["placa", "pci-card"],
    ["pci", "pci-card"],
    ["conversor", "converter"],
    ["extensor", "extender"],
    ["lightining", "lightning-cable"],
    ["lightning", "lightning-cable"],
    ["base notebook", "notebook-base"],
    ["teclado", "keyboard"],
    ["mouse", "mouse"],
    ["hdmi", "cable"],
    ["display", "cable"],
    ["cabo", "cable"],
    ["monitor", "ssd"],
    ["fonte", "adapter"],
    ["hd notebook", "hdd"],
    ["hdd", "hdd"],
    ["rj45", "adapter"],
    ["rede", "adapter"],
    ["headset mono", "mono-headset"],
    ["fone", "headset"],
    ["headset", "headset"],
    ["ssd", "ssd"],
    ["adaptador", "adapter"],
    ["limpeza", "box"],
];

function productIconName(item) {
    const source = `${item?.categoria || ""} ${item?.nome || ""} ${item?.modelo || ""}`.toLowerCase();
    const found = PRODUCT_ICON_MAP.find(([key]) => source.includes(key));
    return found ? found[1] : "box";
}

function formatDate(value) {
    if (!value) return "-";
    return new Date(`${value}Z`).toLocaleString("pt-BR");
}

function pageCodeFromPath() {
    return decodeURIComponent(window.location.pathname.split("/").filter(Boolean).pop() || "");
}

function renderUserShell(user) {
    if (!user) return;
    const name = user.nome || user.username || "Operador";
    const role = user.perfil || "ADMIN";
    document.querySelectorAll("[data-user-name], #userLabel").forEach((item) => {
        item.textContent = name;
    });
    document.querySelectorAll("[data-user-role]").forEach((item) => {
        item.textContent = role;
    });
}

function currentPageMeta(active) {
    const path = window.location.pathname;
    const meta = {
        dashboard: {
            kicker: "PAINEL DE CONTROLE",
            title: "DASHBOARD",
            subtitle: "Resumo rápido do estoque.",
            heroClass: "dashboard-hero",
        },
        produtos: {
            kicker: "CATÁLOGO OPERACIONAL STI",
            title: "PRODUTOS",
            subtitle: "Encontre, confira e movimente itens do estoque com leitura rápida.",
            actions: [{ href: "/produtos/novo", label: "＋ Novo produto", cls: "hero-action" }],
        },
        localizacoes: {
            kicker: "MAPA OPERACIONAL STI",
            title: "LOCALIZAÇÕES",
            subtitle: "Visualize a estrutura física do estoque e gerencie armários, prateleiras e áreas.",
            actions: [{ id: "newLocationButton", label: "＋ Nova localização", cls: "hero-action", type: "button" }],
        },
        etiquetas: {
            kicker: "IDENTIFICAÇÃO STI",
            title: "ETIQUETAS",
            subtitle: "Gere etiquetas e códigos para produtos e localizações.",
        },
        movimentacoes: {
            kicker: "LOG OPERACIONAL STI",
            title: "MOVIMENTAÇÕES",
            subtitle: "Histórico recente do estoque.",
            heroClass: "movements-hero",
        },
        emprestimos: {
            kicker: "CONTROLE DE RETORNO",
            title: "EMPRÉSTIMOS",
            subtitle: "Itens emprestados e devoluções.",
        },
        scanner: {
            kicker: "LEITURA RÁPIDA",
            title: "SCANNER",
            subtitle: "Busca por código interno, barras ou localização.",
        },
        importacao: {
            kicker: "CARGA DE DADOS",
            title: "IMPORTAÇÃO",
            subtitle: "Carga simples de produtos por Excel.",
        },
        usuarios: {
            kicker: "ACESSO DO SISTEMA",
            title: "USUÁRIOS",
            subtitle: "Controle simples de acesso ao sistema.",
            actions: [{ id: "newUserButton", label: "＋ Novo usuário", cls: "hero-action", type: "button" }],
        },
    };

    if (path === "/produtos/novo") {
        return {
            kicker: "CADASTRO OPERACIONAL",
            title: "NOVO PRODUTO",
            subtitle: "Cadastre o item e escolha onde ele ficará.",
            actions: [{ href: "/produtos", label: "← Voltar", cls: "hero-ghost-action" }],
        };
    }
    if (path.startsWith("/produtos/") && path !== "/produtos/novo") {
        return {
            kicker: "FICHA OPERACIONAL",
            title: "PRODUTO",
            subtitle: "Detalhes, estoque, localização e movimentações.",
            titleId: "productTitle",
            subtitleId: "productMeta",
            actions: [{ href: "/produtos", label: "← Voltar", cls: "hero-ghost-action" }],
        };
    }
    return meta[active] || {
        kicker: "ESTOQUE TI",
        title: String(active || "PAINEL").toUpperCase(),
        subtitle: "",
    };
}

function renderHeroActions(actions = []) {
    return actions.map((action) => {
        const cls = action.cls || "hero-action";
        if (action.href) {
            return `<a class="btn ${cls}" href="${action.href}">${action.label}</a>`;
        }
        return `<button class="btn ${cls}" type="${action.type || "button"}" ${action.id ? `id="${action.id}"` : ""}>${action.label}</button>`;
    }).join("");
}

function mountPageHeader(active) {
    const content = document.querySelector("main .pixel-content, main .content-wrap");
    if (!content) return;
    const first = content.firstElementChild;
    if (first && first.classList.contains("pixel-hero")) {
        first.remove();
    }

    const meta = currentPageMeta(active);
    const hero = document.createElement("section");
    hero.className = `pixel-hero app-page-hero ${meta.heroClass || ""} mb-3`;
    hero.innerHTML = `
        <div class="hero-circuit hero-circuit-left"></div>
        <div class="hero-circuit hero-circuit-right"></div>
        <div class="hero-pixels"></div>
        <div class="hero-copy">
            <div class="pixel-kicker">${escapeHtml(meta.kicker)}</div>
            <h1 class="display-title" ${meta.titleId ? `id="${meta.titleId}"` : ""}>${escapeHtml(meta.title)}</h1>
            ${meta.subtitle ? `<p class="products-subtitle" ${meta.subtitleId ? `id="${meta.subtitleId}"` : ""}>${escapeHtml(meta.subtitle)}</p>` : ""}
        </div>
        <div class="hero-actions">${renderHeroActions(meta.actions)}</div>
    `;
    content.insertBefore(hero, content.firstChild);
}

async function requireAuth() {
    const cached = sessionStorage.getItem(AUTH_CACHE_KEY);
    const cachedCsrf = sessionStorage.getItem(AUTH_CSRF_KEY);
    if (cached && cachedCsrf) {
        try {
            currentUser = JSON.parse(cached);
            renderUserShell(currentUser);
            Api.get("/api/auth/me")
                .then(({ data }) => {
                    currentUser = data.user;
                    cacheAuthData(data);
                    renderUserShell(data.user);
                })
                .catch(() => {
                    sessionStorage.removeItem(AUTH_CACHE_KEY);
                    sessionStorage.removeItem(AUTH_CSRF_KEY);
                    if (window.location.pathname !== "/login") window.location.href = "/login";
                });
            return currentUser;
        } catch (_error) {
            sessionStorage.removeItem(AUTH_CACHE_KEY);
            sessionStorage.removeItem(AUTH_CSRF_KEY);
        }
    }
    try {
        const { data } = await Api.get("/api/auth/me");
        currentUser = data.user;
        cacheAuthData(data);
        renderUserShell(data.user);
        return data.user;
    } catch (error) {
        if (window.location.pathname !== "/login") window.location.href = "/login";
        throw error;
    }
}

function mountNav(active) {
    const nav = byId("appNav");
    if (!nav) return;
    document.body.classList.add("ops-app-page", "pixel-ops-page");
    const sidebar = nav.closest(".sidebar");
    if (sidebar) {
        sidebar.classList.add("app-sidebar", "pixel-sidebar");
        nav.classList.add("pixel-nav");
        Array.from(sidebar.children).forEach((child) => {
            if (child !== nav) child.remove();
        });
        const brand = document.createElement("div");
        brand.className = "app-sidebar-brand";
        brand.innerHTML = `
            <div class="app-sidebar-logo">
                <img class="pixel-asset-img" src="/assets/img/pixel-ops/ui/logo-monitor.webp" alt="" decoding="async" onload="this.parentElement.classList.add('has-asset')" onerror="this.remove()">
                <span></span>
            </div>
            <div class="app-sidebar-title">ESTOQUE TI</div>
        `;
        sidebar.insertBefore(brand, nav);
        const userPanel = document.createElement("div");
        userPanel.className = "sidebar-user-panel";
        userPanel.innerHTML = `
            <div class="sidebar-user-card">
                <div class="sidebar-user-avatar">
                    <img class="pixel-asset-img" src="/assets/img/pixel-ops/ui/admin-avatar.webp" alt="" loading="lazy" decoding="async" onload="this.parentElement.classList.add('has-asset')" onerror="this.remove()">
                    <span>▣</span>
                </div>
                <div class="sidebar-user-copy">
                    <div class="sidebar-user-name" data-user-name>Operador</div>
                    <div class="sidebar-user-role" data-user-role>ADMIN</div>
                </div>
            </div>
            <button class="btn sidebar-logout-button" type="button" data-logout>⇥ Sair</button>
        `;
        sidebar.appendChild(userPanel);
    }
    mountPageHeader(active);
    const items = [
        ["dashboard", "/dashboard", "Dashboard", "⌂"],
        ["produtos", "/produtos", "Produtos", "◇"],
        ["localizacoes", "/localizacoes", "Localizações", "⌖"],
        ["etiquetas", "/etiquetas", "Etiquetas", "⌑"],
        ["movimentacoes", "/movimentacoes", "Movimentações", "↔"],
        ["emprestimos", "/emprestimos", "Empréstimos", "♡"],
        ["scanner", "/scanner", "Scanner", "⌗"],
        ["importacao", "/importacao", "Importação", "⇪"],
        ["usuarios", "/usuarios", "Usuários", "♙"],
    ];
    nav.innerHTML = items.map(([key, href, label, icon]) =>
        `<a class="nav-link ${key === active ? "active" : ""}" href="${href}">
            <span class="nav-pixel-icon">
                <img class="pixel-asset-img" src="/assets/img/pixel-ops/nav/${key}.webp" alt="" loading="lazy" decoding="async" onload="this.parentElement.classList.add('has-asset')" onerror="this.remove()">
                <span>${icon}</span>
            </span>${label}
        </a>`
    ).join("");
}

async function logout() {
    await Api.post("/api/auth/logout", {});
    sessionStorage.removeItem(AUTH_CACHE_KEY);
    sessionStorage.removeItem(AUTH_CSRF_KEY);
    window.location.href = "/login";
}

document.addEventListener("click", (event) => {
    if (event.target.matches("[data-logout]")) {
        event.preventDefault();
        logout();
    }
});
