mountNav("produtos");

let product = null;
let locations = [];
const DEFAULT_CATEGORIES = [
    "Adaptadores",
    "Alimentação",
    "Armazenamento",
    "Base Notebook",
    "Baterias",
    "Cabos",
    "Conversores",
    "Extensores",
    "Impressora",
    "Limpeza",
    "Periféricos",
    "Placas PCI-e",
    "Diversos",
];
let categories = [...DEFAULT_CATEGORIES];
let selectedMoveShelf = "";
let editModal = null;

function loggedUserLabel() {
    return (currentUser && (currentUser.nome || currentUser.username)) || "usuário logado";
}

function productAsset(produto) {
    return `/assets/img/pixel-ops/products/${productIconName(produto)}.webp`;
}

function movementFields() {
    const userName = loggedUserLabel();
    const user = escapeHtml(userName);
    const operatorSize = Math.min(Math.max(userName.length, 10), 30);
    const operatorStyle = `style="--operator-ch: ${operatorSize};"`;
    const qtyField = `<div class="detail-field detail-field-small"><label>Quantidade</label><input class="form-control" type="number" min="1" name="quantidade" placeholder="Qtd." required></div>`;
    return {
        entrada: `
        ${qtyField}
        <div class="detail-field detail-field-user" ${operatorStyle}><label>Operador</label><input class="form-control" value="${user}" disabled></div>
        <div class="detail-field detail-field-observation detail-field-inline-observation"><label>Observação</label><input class="form-control" name="observacao" placeholder="Observação"></div>
    `,
        retirada: `
        ${qtyField}
        <div class="detail-field detail-field-user" ${operatorStyle}><label>Operador</label><input class="form-control" value="${user}" disabled></div>
        <div class="detail-field detail-field-person detail-field-person-wide"><label>Entregue para</label><input class="form-control" name="entregue_para" placeholder="Nome ou setor" required></div>
        <div class="detail-field detail-field-destination"><label>Destino</label><input class="form-control" name="destino" placeholder="Destino"></div>
        <div class="detail-field detail-field-observation detail-field-after-destination"><label>Observação</label><input class="form-control" name="observacao" placeholder="Observação"></div>
    `,
        emprestimo: `
        ${qtyField}
        <div class="detail-field detail-field-user" ${operatorStyle}><label>Operador</label><input class="form-control" value="${user}" disabled></div>
        <div class="detail-field detail-field-person"><label>Emprestado para</label><input class="form-control" name="emprestado_para" placeholder="Nome ou setor" required></div>
        <div class="detail-field detail-field-observation detail-field-trailing-observation"><label>Observação</label><input class="form-control" name="observacao" placeholder="Observação"></div>
    `,
        descarte: `
        ${qtyField}
        <div class="detail-field detail-field-user" ${operatorStyle}><label>Operador</label><input class="form-control" value="${user}" disabled></div>
        <div class="detail-field detail-field-reason"><label>Motivo</label><input class="form-control" name="motivo" placeholder="Motivo" required></div>
        <div class="detail-field detail-field-observation detail-field-trailing-observation"><label>Observação</label><input class="form-control" name="observacao" placeholder="Observação"></div>
    `,
    };
}

function renderMovementFields() {
    if (!["entrada", "retirada", "emprestimo", "descarte"].includes(byId("movementType").value)) {
        byId("movementType").value = "retirada";
    }
    byId("movementFields").innerHTML = movementFields()[byId("movementType").value] || "";
    byId("movementTypeButtons").querySelectorAll("[data-movement-type]").forEach((button) => {
        button.classList.toggle("active", button.dataset.movementType === byId("movementType").value);
    });
}

function applyActionFromQuery() {
    const action = new URLSearchParams(window.location.search).get("acao");
    if (!["entrada", "retirada", "emprestimo", "descarte"].includes(action)) return;
    byId("movementType").value = action;
    renderMovementFields();
    byId("movementForm").scrollIntoView({ behavior: "smooth", block: "start" });
}

function clearAlert() {
    const target = byId("alert");
    if (target) target.innerHTML = "";
}

function statusClass(status) {
    if (status === "baixo") return "is-low";
    if (status === "zerado") return "is-zero";
    return "is-ok";
}

function movementLabel(tipo) {
    return {
        entrada: "Entrada",
        retirada: "Retirada",
        emprestimo: "Emprestimo",
        devolucao: "Devolucao",
        descarte: "Descarte",
        mover: "Movido",
    }[tipo] || tipo;
}

async function loadLocations() {
    const { data } = await Api.get("/api/localizacoes");
    locations = sortLocations(data.localizacoes);
    if (!selectedMoveShelf && locations.length) selectedMoveShelf = shelfKey(locations[0]);
    renderMoveLocationPicker();
}

function renderCategorySelect(selectId, selectedValue = "Diversos") {
    const select = byId(selectId);
    if (!select) return;
    const selected = String(selectedValue || "Diversos");
    const values = [...categories];
    if (selected && !values.includes(selected)) values.push(selected);
    select.innerHTML = values.map((categoria) =>
        `<option value="${escapeHtml(categoria)}" ${categoria === selected ? "selected" : ""}>${escapeHtml(categoria)}</option>`
    ).join("");
}

async function loadCategories() {
    renderCategorySelect("editCategorySelect", product?.categoria);
    try {
        const { data } = await Api.get("/api/produtos/categorias");
        categories = data.categorias?.length ? data.categorias : DEFAULT_CATEGORIES;
    } catch (_error) {
        categories = DEFAULT_CATEGORIES;
    }
    renderCategorySelect("editCategorySelect", product?.categoria);
}

async function loadProduct() {
    const { data } = await Api.get(`/api/produtos/${encodeURIComponent(pageCodeFromPath())}`);
    product = data.produto;
    byId("productTitle").textContent = product.nome;
    byId("productMeta").textContent = `${product.codigo} · ${product.localizacao_label}`;
    byId("currentLocationLabel").textContent = product.localizacao_label;
    byId("currentLocationCode").textContent = `Código: ${product.localizacao.codigo}`;
    byId("productInfo").innerHTML = `
        <div class="product-summary-top">
            <div class="product-detail-icon ${statusClass(product.status)}">
                <img src="${productAsset(product)}" alt="">
            </div>
            <div class="product-summary-title">
                <span class="panel-kicker">Ficha do item</span>
                <h2>${escapeHtml(product.nome)}</h2>
                <p>${escapeHtml(product.modelo || "Sem modelo informado")}</p>
            </div>
        </div>
        <div class="product-summary-status">
            ${statusBadge(product.status)}
            <span>Quantidade</span>
        </div>
        <div class="detail-metrics">
            <div><span>Atual</span><strong>${product.quantidade_atual}</strong></div>
            <div><span>Mínimo</span><strong>${product.estoque_minimo}</strong></div>
            <div><span>Código</span><strong>${escapeHtml(product.codigo)}</strong></div>
        </div>
        <div class="detail-data-grid">
            <div><span>Categoria</span><strong>${escapeHtml(product.categoria || "-")}</strong></div>
            <div><span>Cód. barras</span><strong>${escapeHtml(product.codigo_barras || "-")}</strong></div>
            <div><span>Localização</span><strong>${escapeHtml(product.localizacao_label)}</strong></div>
        </div>
        <button class="btn btn-outline-primary w-100 mt-3" type="button" id="editProductButton">Editar produto</button>
    `;
    byId("editProductButton").addEventListener("click", openEditModal);
    byId("historyRows").innerHTML = data.movimentacoes.map((mov) => {
        const detalhes = [
            mov.responsavel_destino ? `Para: ${mov.responsavel_destino}` : "",
            mov.destino ? `Destino: ${mov.destino}` : "",
            mov.motivo ? `Motivo: ${mov.motivo}` : "",
            mov.observacao || "",
        ].filter(Boolean).join(" · ");
        return `
            <article class="history-item">
                <div class="history-icon movement-type-${escapeHtml(mov.tipo)}">${mov.tipo === "entrada" ? "↓" : mov.tipo === "retirada" ? "↑" : mov.tipo === "mover" ? "↔" : "#"}</div>
                <div class="history-body">
                    <div class="history-title">
                        <strong>${escapeHtml(movementLabel(mov.tipo))}</strong>
                        <span>${formatDate(mov.data_hora)}</span>
                    </div>
                    <p>${escapeHtml(detalhes || "Sem detalhes adicionais.")}</p>
                    <small>${escapeHtml(mov.usuario_nome || mov.usuario_username || "-")}</small>
                </div>
                <div class="history-qty">${mov.quantidade}</div>
            </article>
        `;
    }).join("") || `<div class="detail-empty">Sem histórico.</div>`;
    renderMoveLocationPicker();
    if (byId("movementFields")) {
        renderMovementFields();
    }
}

function openEditModal() {
    const form = byId("editProductForm");
    renderCategorySelect("editCategorySelect", product.categoria);
    ["nome", "categoria", "modelo", "codigo_barras", "estoque_minimo", "observacao"].forEach((field) => {
        if (form.elements[field]) form.elements[field].value = product[field] ?? "";
    });
    editModal.show();
}

function shelfKey(loc) {
    return `${loc.armario}|${loc.prateleira}`;
}

function shelfLabel(key) {
    const [armario, prateleira] = key.split("|");
    return `${friendlyArmario(armario)} > ${prateleira}`;
}

function renderMoveLocationPicker() {
    const shelfTarget = byId("moveShelfOptions");
    const cardTarget = byId("moveLocationCards");
    if (!shelfTarget || !cardTarget || !locations.length) return;
    const shelves = [...new Map(locations.map((loc) => [shelfKey(loc), loc])).keys()];
    if (!selectedMoveShelf && shelves.length) selectedMoveShelf = shelves[0];
    const selectedCode = byId("moveSelectedLocation").value;
    shelfTarget.innerHTML = shelves.map((key) => `
        <button class="location-choice ${key === selectedMoveShelf ? "active" : ""}" type="button" data-move-shelf="${escapeHtml(key)}">
            <span class="fw-semibold">${escapeHtml(shelfLabel(key))}</span>
            <span class="small text-secondary">${locations.filter((loc) => shelfKey(loc) === key).length} opções</span>
        </button>
    `).join("");
    const shelfLocations = locations.filter((loc) => shelfKey(loc) === selectedMoveShelf);
    cardTarget.innerHTML = shelfLocations.map((loc) => {
        const current = product && loc.codigo === product.localizacao.codigo;
        return `
            <button class="location-choice ${loc.codigo === selectedCode ? "active" : ""}" type="button" data-move-location="${escapeHtml(loc.codigo)}">
                <span class="fw-semibold">${escapeHtml(loc.nome)}</span>
                <span class="small text-secondary">${escapeHtml(loc.codigo)}${current ? " · atual" : ""}</span>
            </button>
        `;
    }).join("") || `<div class="text-secondary">Nenhuma localização nessa prateleira.</div>`;
    const selected = locations.find((loc) => loc.codigo === selectedCode);
    byId("moveSelectionLabel").innerHTML = selected
        ? `Selecionado: <strong>${escapeHtml(friendlyLocation(selected))}</strong><div class="small">${escapeHtml(selected.codigo)}</div>`
        : "Escolha uma localização.";
}

function movementPayload(form) {
    const data = formDataObject(form);
    const payload = {
        produto_id: product.id,
        quantidade: data.quantidade,
        observacao: data.observacao,
    };
    if (data.tipo === "retirada") {
        payload.entregue_para = data.entregue_para;
        payload.destino = data.destino;
    }
    if (data.tipo === "emprestimo") {
        payload.emprestado_para = data.emprestado_para;
    }
    if (data.tipo === "descarte") {
        payload.motivo = data.motivo;
    }
    return { tipo: data.tipo, payload };
}

function validateMovement(tipo, payload) {
    if (!Number(payload.quantidade) || Number(payload.quantidade) <= 0) {
        return "Informe uma quantidade maior que zero.";
    }
    if (tipo === "retirada" && !payload.entregue_para) {
        return "Informe quem recebeu o produto.";
    }
    if (tipo === "emprestimo" && !payload.emprestado_para) {
        return "Informe para quem foi emprestado.";
    }
    if (tipo === "descarte" && !payload.motivo) {
        return "Informe o motivo do descarte.";
    }
    return null;
}

(async function init() {
    await requireAuth();
    await Promise.all([loadCategories(), loadLocations()]);
    await loadProduct();
    editModal = new bootstrap.Modal(byId("editProductModal"));
    renderMovementFields();
    applyActionFromQuery();

    byId("movementTypeButtons").addEventListener("click", (event) => {
        const button = event.target.closest("[data-movement-type]");
        if (!button) return;
        byId("movementType").value = button.dataset.movementType;
        renderMovementFields();
    });

    byId("moveShelfOptions").addEventListener("click", (event) => {
        const button = event.target.closest("[data-move-shelf]");
        if (!button) return;
        selectedMoveShelf = button.dataset.moveShelf;
        byId("moveSelectedLocation").value = "";
        renderMoveLocationPicker();
    });

    byId("moveLocationCards").addEventListener("click", (event) => {
        const button = event.target.closest("[data-move-location]");
        if (!button) return;
        byId("moveSelectedLocation").value = button.dataset.moveLocation;
        renderMoveLocationPicker();
    });

    byId("movementForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        clearAlert();
        const form = event.currentTarget;
        const submit = form.querySelector("button[type='submit']");
        if (submit.disabled) return;
        submit.disabled = true;
        const { tipo, payload } = movementPayload(form);
        const validationMessage = validateMovement(tipo, payload);
        if (validationMessage) {
            setAlert(validationMessage, "warning");
            submit.disabled = false;
            return;
        }
        try {
            const { message } = await Api.post(`/api/movimentacoes/${tipo}`, payload);
            form.reset();
            await loadProduct();
            setAlert(message || "Movimentação registrada.");
        } catch (error) {
            setAlert(error.message, "danger");
        } finally {
            submit.disabled = false;
        }
    });

    byId("editProductForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        try {
            const { message } = await Api.put(`/api/produtos/${product.id}`, formDataObject(event.currentTarget));
            editModal.hide();
            await loadProduct();
            setAlert(message || "Produto atualizado.");
        } catch (error) {
            setAlert(error.message, "danger");
        }
    });

    byId("moveForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        clearAlert();
        const form = event.currentTarget;
        try {
            if (!byId("moveSelectedLocation").value) {
                setAlert("Escolha uma localização de destino.", "danger");
                return;
            }
            const { message } = await Api.post(`/api/produtos/${product.id}/mover`, formDataObject(form));
            await loadProduct();
            form.reset();
            byId("moveSelectedLocation").value = "";
            renderMoveLocationPicker();
            setAlert(message || "Produto movido.");
        } catch (error) {
            setAlert(error.message, "danger");
        }
    });
})();
