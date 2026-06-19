mountNav("produtos");

let product = null;
let locations = [];
let selectedMoveShelf = "";
<<<<<<< HEAD
let editModal = null;
=======
let currentUser = null;
let editModal = null;
let deleteModal = null;
>>>>>>> c8da6591bc55c3ea4cf2766c27e532b7609c9962

const movementFields = {
    entrada: `
        <div class="col-md-3"><input class="form-control" type="number" min="1" name="quantidade" placeholder="Quantidade" required></div>
<<<<<<< HEAD
        <div class="col-md-5"><input class="form-control" value="Recebido por: usuário logado" disabled></div>
=======
        <div class="col-md-5"><input class="form-control" name="responsavel_visual" placeholder="Recebido por" readonly></div>
>>>>>>> c8da6591bc55c3ea4cf2766c27e532b7609c9962
        <div class="col-12"><input class="form-control" name="observacao" placeholder="Observação"></div>
    `,
    retirada: `
        <div class="col-md-3"><input class="form-control" type="number" min="1" name="quantidade" placeholder="Quantidade" required></div>
<<<<<<< HEAD
        <div class="col-md-4"><input class="form-control" value="Entregue por: usuário logado" disabled></div>
        <div class="col-md-5"><input class="form-control" name="entregue_para" placeholder="Entregue para" required></div>
=======
        <div class="col-md-4"><input class="form-control" name="responsavel_visual" placeholder="Entregue por" readonly></div>
        <div class="col-md-5"><input class="form-control" name="entregue_para" placeholder="Entregue para"></div>
>>>>>>> c8da6591bc55c3ea4cf2766c27e532b7609c9962
        <div class="col-md-6"><input class="form-control" name="destino" placeholder="Destino"></div>
        <div class="col-md-6"><input class="form-control" name="observacao" placeholder="Observação"></div>
    `,
    emprestimo: `
        <div class="col-md-3"><input class="form-control" type="number" min="1" name="quantidade" placeholder="Quantidade" required></div>
<<<<<<< HEAD
        <div class="col-md-4"><input class="form-control" value="Entregue por: usuário logado" disabled></div>
        <div class="col-md-5"><input class="form-control" name="emprestado_para" placeholder="Emprestado para" required></div>
=======
        <div class="col-md-4"><input class="form-control" name="responsavel_visual" placeholder="Entregue por" readonly></div>
        <div class="col-md-5"><input class="form-control" name="emprestado_para" placeholder="Emprestado para"></div>
>>>>>>> c8da6591bc55c3ea4cf2766c27e532b7609c9962
        <div class="col-12"><input class="form-control" name="observacao" placeholder="Observação"></div>
    `,
    descarte: `
        <div class="col-md-3"><input class="form-control" type="number" min="1" name="quantidade" placeholder="Quantidade" required></div>
<<<<<<< HEAD
        <div class="col-md-4"><input class="form-control" value="Descartado por: usuário logado" disabled></div>
        <div class="col-md-5"><input class="form-control" name="motivo" placeholder="Motivo" required></div>
=======
        <div class="col-md-4"><input class="form-control" name="responsavel_visual" placeholder="Descartado por" readonly></div>
        <div class="col-md-5"><input class="form-control" name="motivo" placeholder="Motivo"></div>
>>>>>>> c8da6591bc55c3ea4cf2766c27e532b7609c9962
        <div class="col-12"><input class="form-control" name="observacao" placeholder="Observação"></div>
    `,
};

function renderMovementFields() {
    byId("movementFields").innerHTML = movementFields[byId("movementType").value] || "";
    const responsible = byId("movementFields").querySelector("[name='responsavel_visual']");
    if (responsible) responsible.value = currentUser?.nome || currentUser?.username || "";
    byId("movementTypeButtons").querySelectorAll("[data-movement-type]").forEach((button) => {
        button.classList.toggle("active", button.dataset.movementType === byId("movementType").value);
    });
}

function clearAlert() {
    const target = byId("alert");
    if (target) target.innerHTML = "";
}

async function loadLocations() {
    const { data } = await Api.get("/api/localizacoes");
    locations = sortLocations(data.localizacoes);
    if (!selectedMoveShelf && locations.length) selectedMoveShelf = shelfKey(locations[0]);
    renderMoveLocationPicker();
}

async function loadProduct() {
    const { data } = await Api.get(`/api/produtos/${encodeURIComponent(pageCodeFromPath())}`);
    product = data.produto;
    byId("productTitle").textContent = product.nome;
    byId("productMeta").textContent = `${product.codigo} · ${product.localizacao_label}`;
    byId("currentLocationLabel").textContent = product.localizacao_label;
    byId("currentLocationCode").textContent = `Código: ${product.localizacao.codigo}`;
    byId("productInfo").innerHTML = `
        <div class="d-flex justify-content-between align-items-start mb-3">
            <div>${statusBadge(product.status)}</div>
            <img class="qr-img border rounded" src="/api/etiquetas/produto/${product.id}/qr.png" alt="QR Code do produto">
        </div>
        <dl class="row mb-0">
            <dt class="col-5">Controle</dt><dd class="col-7">${product.tipo_controle === "unidade" ? "Unidade" : "Quantidade"}</dd>
            <dt class="col-5">Quantidade</dt><dd class="col-7">${product.quantidade_atual}</dd>
            ${product.tipo_controle === "unidade" ? `<dt class="col-5">Prefixo</dt><dd class="col-7">${escapeHtml(product.prefixo_rastreio || "-")}</dd>` : ""}
            <dt class="col-5">Mínimo</dt><dd class="col-7">${product.estoque_minimo}</dd>
            <dt class="col-5">Categoria</dt><dd class="col-7">${escapeHtml(product.categoria || "-")}</dd>
            <dt class="col-5">Modelo</dt><dd class="col-7">${escapeHtml(product.modelo || "-")}</dd>
            <dt class="col-5">Barras</dt><dd class="col-7">${escapeHtml(product.codigo_barras || "-")}</dd>
            <dt class="col-5">Controle</dt><dd class="col-7">${product.tipo_controle === "unidade" ? "Unidade" : "Quantidade"}</dd>
            ${product.tipo_controle === "unidade" ? `<dt class="col-5">Prefixo</dt><dd class="col-7">${escapeHtml(product.prefixo_rastreio || "-")}</dd>` : ""}
        </dl>
        <button class="btn btn-outline-primary w-100 mt-3" type="button" id="editProductButton">Editar produto</button>
    `;
<<<<<<< HEAD
    byId("editProductButton").addEventListener("click", openEditModal);
    renderUnits(data.unidades || []);
=======
    byId("currentLocationLabel").textContent = product.localizacao_label || "";
    byId("currentLocationCode").textContent = `Código: ${product.localizacao?.codigo || "-"}`;
>>>>>>> c8da6591bc55c3ea4cf2766c27e532b7609c9962
    byId("historyRows").innerHTML = data.movimentacoes.map((mov) => `
        <tr><td>${formatDate(mov.data_hora)}</td><td>${escapeHtml(mov.tipo)}</td><td>${mov.quantidade}</td><td>${escapeHtml([mov.observacao, mov.unidades_codigos ? `Unidades: ${mov.unidades_codigos}` : ""].filter(Boolean).join(" · "))}</td></tr>
    `).join("") || `<tr><td colspan="4" class="text-secondary">Sem histórico.</td></tr>`;
    const unitCard = byId("unitCard");
    unitCard.classList.toggle("d-none", product.tipo_controle !== "unidade");
    byId("unitRows").innerHTML = (data.unidades || []).map((unit) => `
        <tr><td class="fw-semibold">${escapeHtml(unit.codigo_unidade)}</td><td>${escapeHtml(unit.status)}</td></tr>
    `).join("") || `<tr><td colspan="2" class="text-secondary">Nenhuma unidade cadastrada.</td></tr>`;
    renderMoveLocationPicker();
}

<<<<<<< HEAD
function renderUnits(unidades) {
    const card = byId("unitCard");
    if (!card) return;
    card.classList.toggle("d-none", product.tipo_controle !== "unidade");
    if (product.tipo_controle !== "unidade") return;
    byId("unitRows").innerHTML = unidades.map((unit) => `
        <tr><td>${escapeHtml(unit.codigo_unidade)}</td><td>${escapeHtml(unit.status)}</td></tr>
    `).join("") || `<tr><td colspan="2" class="text-secondary">Sem unidades.</td></tr>`;
}

function openEditModal() {
    const form = byId("editProductForm");
    ["nome", "categoria", "modelo", "codigo_barras", "estoque_minimo", "observacao"].forEach((field) => {
        if (form.elements[field]) form.elements[field].value = product[field] ?? "";
    });
    editModal.show();
=======
function fillEditForm() {
    const form = byId("editProductForm");
    ["nome", "categoria", "marca", "modelo", "codigo_barras", "estoque_minimo", "observacao"].forEach((name) => {
        form.elements[name].value = product[name] || "";
    });
>>>>>>> c8da6591bc55c3ea4cf2766c27e532b7609c9962
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
    if (data.tipo === "entrada") payload.recebido_por = data.recebido_por;
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
<<<<<<< HEAD
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
=======
    if (!payload.quantidade || Number(payload.quantidade) <= 0) return "Informe a quantidade.";
    if (tipo === "retirada" && !payload.entregue_para) return "Informe quem recebeu o produto.";
    if (tipo === "emprestimo" && !payload.emprestado_para) return "Informe para quem foi emprestado.";
    if (tipo === "descarte" && !payload.motivo) return "Informe o motivo do descarte.";
>>>>>>> c8da6591bc55c3ea4cf2766c27e532b7609c9962
    return null;
}

(async function init() {
    currentUser = await requireAuth();
    editModal = new bootstrap.Modal(byId("editProductModal"));
    deleteModal = new bootstrap.Modal(byId("deleteProductModal"));
    await loadLocations();
    await loadProduct();
    editModal = new bootstrap.Modal(byId("editProductModal"));
    renderMovementFields();

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
<<<<<<< HEAD
        const validationMessage = validateMovement(tipo, payload);
        if (validationMessage) {
            setAlert(validationMessage, "warning");
=======
        const validation = validateMovement(tipo, payload);
        if (validation) {
            setAlert(validation, "warning");
>>>>>>> c8da6591bc55c3ea4cf2766c27e532b7609c9962
            submit.disabled = false;
            return;
        }
        try {
            const { message } = await Api.post(`/api/movimentacoes/${tipo}`, payload);
            form.reset();
            renderMovementFields();
            await loadProduct();
            setAlert(message || "Movimentação registrada.");
        } catch (error) {
            setAlert(error.message, "danger");
        } finally {
            submit.disabled = false;
        }
    });

<<<<<<< HEAD
=======
    byId("editProductButton").addEventListener("click", () => {
        fillEditForm();
        editModal.show();
    });

    byId("deleteProductButton").addEventListener("click", () => {
        byId("deleteProductName").textContent = product.nome;
        byId("deleteProductCode").textContent = product.codigo;
        deleteModal.show();
    });

    byId("confirmDeleteProduct").addEventListener("click", async (event) => {
        const button = event.currentTarget;
        if (button.disabled) return;
        button.disabled = true;
        try {
            const { message } = await Api.delete(`/api/produtos/${product.id}`);
            deleteModal.hide();
            sessionStorage.setItem("productToast", message || "Produto excluído.");
            window.location.href = "/produtos";
        } catch (error) {
            setAlert(error.message, "danger");
            deleteModal.hide();
        } finally {
            button.disabled = false;
        }
    });

>>>>>>> c8da6591bc55c3ea4cf2766c27e532b7609c9962
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
