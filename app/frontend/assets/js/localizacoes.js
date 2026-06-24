mountNav("localizacoes");

let locationMap = null;
let activeFilter = "todos";
let searchTerm = "";
let newLocationModal = null;
let shelfDetailModal = null;
let moveLocationModal = null;
let editLocationModal = null;
let activeShelf = null;
let activeShelfDetail = null;
let locationContext = null;
let movingLocation = null;
let codeSuggestionTimer = null;
let editCodeSuggestionTimer = null;
let childModalSaved = false;
let childModalReturnShelf = null;

function pixelAsset(path, alt = "") {
    return `<img src="${path}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async">`;
}

function shelfVisible(shelf) {
    if (activeFilter === "futuro" || activeFilter === "armarios") return false;
    if (activeFilter === "livres" && shelf.ocupacao_percentual >= 100) return false;
    const text = `${shelf.codigo} ${shelf.nome}`.toLowerCase();
    return !searchTerm || text.includes(searchTerm);
}

function futureVisible(item) {
    if (!["todos", "armarios", "futuro"].includes(activeFilter)) return false;
    const text = `${item.codigo} ${item.nome} ${item.status}`.toLowerCase();
    return !searchTerm || text.includes(searchTerm);
}

function renderShelf(shelf) {
    return `
        <article class="shelf-card">
            <div class="shelf-card-top">
                <span class="shelf-code">${escapeHtml(shelf.codigo)}</span>
                <div class="shelf-card-actions">
                    <button type="button" data-new-location-shelf="${escapeHtml(shelf.codigo)}" aria-label="Nova localização em ${escapeHtml(shelf.codigo)}">+</button>
                    <button type="button" data-shelf-code="${escapeHtml(shelf.codigo)}" aria-label="Ver ${escapeHtml(shelf.codigo)}">›</button>
                </div>
            </div>
            <h3>${escapeHtml(shelf.nome)}</h3>
            <div class="shelf-stats">
                <span><strong>${shelf.produtos}</strong> produtos</span>
                <span><strong>${shelf.localizacoes}</strong> localizações</span>
            </div>
            <div class="occupancy-row">
                <span>Ocupação</span>
                <strong>${shelf.ocupacao_percentual}%</strong>
            </div>
            <div class="occupancy-bar"><i style="width: ${shelf.ocupacao_percentual}%"></i></div>
        </article>
    `;
}

function shelfMetric(label, value) {
    return `<div><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`;
}

function renderShelfDetail(data) {
    const shelf = data.prateleira;
    activeShelf = shelf;
    activeShelfDetail = data;
    byId("shelfDetailTitle").textContent = `${shelf.armario} > ${shelf.codigo} · ${shelf.nome}`;
    byId("shelfDetailMetrics").innerHTML = [
        shelfMetric("Localizações", data.localizacoes.length),
        shelfMetric("Produtos", data.produtos.length),
        shelfMetric("Capacidade estimada", data.capacidade_estimada),
        shelfMetric("Espaços livres", Math.max(Number(data.capacidade_estimada || 0) - data.localizacoes.length, 0)),
    ].join("");

    byId("shelfLocationList").innerHTML = data.localizacoes.map((loc) => `
        <article class="shelf-location-item">
            <div>
                <strong>${escapeHtml(loc.nome)}</strong>
                <span>${escapeHtml(loc.codigo)}</span>
            </div>
            <div>
                <strong>${loc.produtos_count}</strong>
                <span>produtos</span>
            </div>
            <button type="button" data-edit-location-id="${loc.id}">Editar</button>
            <button type="button" data-move-location-id="${loc.id}">Mover</button>
        </article>
    `).join("") || `<div class="locations-empty">Nenhuma localização cadastrada nessa prateleira.</div>`;
    byId("shelfLocationList").innerHTML += `
        <button class="shelf-add-location" type="button" data-new-location-for-shelf>
            + Nova localização em ${escapeHtml(shelf.codigo)}
        </button>
    `;

    byId("shelfProductList").innerHTML = data.produtos.map((produto) => `
        <a class="shelf-product-item" href="/produtos/${encodeURIComponent(produto.codigo)}">
            <div>
                <strong>${escapeHtml(produto.nome)}</strong>
                <span>${escapeHtml(produto.codigo)} · ${escapeHtml(produto.localizacao_nome)}</span>
            </div>
            <em>${produto.quantidade_atual}</em>
        </a>
    `).join("") || `<div class="locations-empty">Nenhum produto armazenado nessa prateleira.</div>`;

    const form = byId("shelfConfigForm");
    form.elements.id.value = shelf.id;
    form.elements.armario.value = shelf.armario;
    form.elements.codigo.value = shelf.codigo;
    form.elements.codigo.readOnly = true;
    form.elements.nome.value = shelf.nome;
    form.elements.ordem.value = shelf.ordem;
    byId("shelfConfigSubmit").textContent = "Salvar prateleira";
}

async function openShelfDetail(code, armario = "ARM01") {
    const { data } = await Api.get(`/api/localizacoes/prateleiras/${encodeURIComponent(armario)}/${encodeURIComponent(code)}/detalhe`);
    renderShelfDetail(data);
    shelfDetailModal.show();
}

function waitForModalHidden(modalElement) {
    if (!modalElement.classList.contains("show")) return Promise.resolve();
    return new Promise((resolve) => {
        modalElement.addEventListener("hidden.bs.modal", resolve, { once: true });
    });
}

async function showChildLocationModal(modal) {
    childModalSaved = false;
    const shelfModalElement = byId("shelfDetailModal");
    if (shelfModalElement.classList.contains("show")) {
        childModalReturnShelf = activeShelf ? { codigo: activeShelf.codigo, armario: activeShelf.armario } : null;
        shelfDetailModal.hide();
        await waitForModalHidden(shelfModalElement);
    } else {
        childModalReturnShelf = null;
    }
    modal.show();
}

async function reopenActiveShelf() {
    const shelf = childModalReturnShelf || activeShelf;
    if (!shelf) return;
    await openShelfDetail(shelf.codigo, shelf.armario);
}

async function maybeReopenShelfAfterChild() {
    if (childModalSaved || !childModalReturnShelf) return;
    await reopenActiveShelf();
    childModalReturnShelf = null;
}

async function updateLocationCodeSuggestion() {
    const form = byId("locationForm");
    const nome = String(form.elements.nome.value || "").trim();
    const armario = String(form.elements.armario.value || "").trim();
    const prateleira = String(form.elements.prateleira.value || "").trim();
    if (!nome || !armario || !prateleira) {
        form.elements.codigo.value = "";
        return;
    }
    const query = new URLSearchParams({ nome, armario, prateleira });
    const { data } = await Api.get(`/api/localizacoes/codigo-sugerido?${query.toString()}`);
    form.elements.codigo.value = data.codigo;
}

function scheduleLocationCodeSuggestion() {
    window.clearTimeout(codeSuggestionTimer);
    codeSuggestionTimer = window.setTimeout(async () => {
        try {
            await updateLocationCodeSuggestion();
        } catch (error) {
            byId("locationForm").elements.codigo.value = "";
        }
    }, 250);
}

async function updateEditLocationCodeSuggestion() {
    const form = byId("editLocationForm");
    const nome = String(form.elements.nome.value || "").trim();
    const armario = String(form.elements.armario.value || "").trim();
    const prateleira = String(form.elements.prateleira.value || "").trim();
    const id = String(form.elements.id.value || "").trim();
    if (!nome || !armario || !prateleira) return;
    const query = new URLSearchParams({ nome, armario, prateleira, id });
    const { data } = await Api.get(`/api/localizacoes/codigo-sugerido?${query.toString()}`);
    form.elements.codigo.value = data.codigo;
}

function scheduleEditLocationCodeSuggestion() {
    window.clearTimeout(editCodeSuggestionTimer);
    editCodeSuggestionTimer = window.setTimeout(async () => {
        try {
            await updateEditLocationCodeSuggestion();
        } catch (error) {
            // A edição ainda pode ser salva; o backend recalcula o código final.
        }
    }, 250);
}

function openLocationModal(context = null) {
    locationContext = context;
    const form = byId("locationForm");
    form.reset();
    form.elements.codigo.readOnly = true;
    form.elements.codigo.value = "";
    form.elements.armario.readOnly = false;
    form.elements.prateleira.readOnly = false;
    form.elements.armario.value = "ARM01";
    form.elements.prateleira.value = "";
    form.elements.ordem.value = "0";
    byId("locationModalContext").textContent = "Cadastro operacional";
    byId("locationCreateHint").textContent = "Digite o nome e a prateleira para gerar um código único automaticamente.";

    if (context && context.shelf) {
        form.elements.armario.value = context.shelf.armario;
        form.elements.prateleira.value = context.shelf.codigo;
        form.elements.armario.readOnly = true;
        form.elements.prateleira.readOnly = true;
        form.elements.ordem.value = context.nextOrder || "0";
        form.elements.codigo.value = context.suggestedCode || "";
        form.elements.nome.value = context.defaultName || "";
        byId("locationModalContext").textContent = `${context.shelf.armario} > ${context.shelf.codigo}`;
        byId("locationCreateHint").textContent = `O código será montado por armário, prateleira e nome: ${context.shelf.armario}-${context.shelf.codigo}-NOME.`;
    }

    if (form.elements.nome.value) {
        scheduleLocationCodeSuggestion();
    }

    showChildLocationModal(newLocationModal);
}

function openNewShelfConfig() {
    activeShelf = null;
    byId("shelfDetailTitle").textContent = "Nova prateleira";
    byId("shelfDetailMetrics").innerHTML = [
        shelfMetric("Localizações", 0),
        shelfMetric("Produtos", 0),
        shelfMetric("Capacidade estimada", 4),
        shelfMetric("Espaços livres", 4),
    ].join("");
    byId("shelfLocationList").innerHTML = `<div class="locations-empty">Cadastre a prateleira para vincular localizações.</div>`;
    byId("shelfProductList").innerHTML = `<div class="locations-empty">Nenhum produto armazenado.</div>`;
    const form = byId("shelfConfigForm");
    form.reset();
    form.elements.id.value = "";
    form.elements.armario.value = "ARM01";
    form.elements.codigo.readOnly = false;
    form.elements.codigo.value = "";
    form.elements.nome.value = "";
    form.elements.ordem.value = "0";
    byId("shelfConfigSubmit").textContent = "Criar prateleira";
    shelfDetailModal.show();
}

function renderShelfSelect(targetId, selectedCode) {
    const shelves = locationMap && locationMap.armarios[0] ? locationMap.armarios[0].prateleiras : [];
    byId(targetId).innerHTML = shelves.map((shelf) => `
        <option value="${escapeHtml(shelf.codigo)}" ${shelf.codigo === selectedCode ? "selected" : ""}>
            ${escapeHtml(shelf.codigo)} - ${escapeHtml(shelf.nome)}
        </option>
    `).join("");
}

function openMoveLocation(loc) {
    movingLocation = loc;
    const form = byId("moveLocationForm");
    form.reset();
    form.elements.id.value = loc.id;
    form.elements.armario.value = loc.armario;
    form.elements.ordem.value = loc.ordem;
    renderShelfSelect("moveShelfSelect", loc.prateleira);
    byId("moveLocationTitle").textContent = `Mover ${loc.codigo}`;
    byId("moveLocationHint").textContent = `Atual: ${loc.armario} > ${loc.prateleira} · ${loc.nome}`;
    showChildLocationModal(moveLocationModal);
}

function openEditLocation(loc) {
    const form = byId("editLocationForm");
    form.reset();
    form.elements.id.value = loc.id;
    form.elements.codigo.value = loc.codigo;
    form.elements.nome.value = loc.nome;
    form.elements.descricao.value = loc.descricao || "";
    form.elements.armario.value = loc.armario;
    form.elements.ordem.value = loc.ordem;
    renderShelfSelect("editShelfSelect", loc.prateleira);
    byId("editLocationTitle").textContent = loc.codigo;
    byId("editLocationHint").textContent = `Atual: ${loc.armario} > ${loc.prateleira}. O código acompanha nome, armário e prateleira.`;
    showChildLocationModal(editLocationModal);
}

function renderOperationalMap() {
    if (!locationMap) return;
    const armario = locationMap.armarios[0];
    const shelves = armario.prateleiras.filter(shelfVisible);
    const totalShelves = armario.prateleiras.length;
    const locations = armario.prateleiras.reduce((sum, shelf) => sum + Number(shelf.localizacoes || 0), 0);
    const products = armario.prateleiras.reduce((sum, shelf) => sum + Number(shelf.produtos || 0), 0);
    const capacity = Math.max(totalShelves * 4, 1);
    const occupancy = Math.min(Math.round((locations / capacity) * 100), 100);

    byId("operationalMap").innerHTML = `
        <article class="operational-cabinet-card">
            <div class="cabinet-header">
                <div class="cabinet-identity">
                    <div class="cabinet-icon">${pixelAsset("/assets/img/pixel-ops/dashboard/ARM01.webp", "ARM01")}</div>
                    <div>
                        <span class="panel-kicker">Armário ativo</span>
                        <h2>${escapeHtml(armario.codigo)}</h2>
                        <p>${escapeHtml(armario.nome)}</p>
                    </div>
                </div>
                <span class="cabinet-status">ONLINE</span>
            </div>
            <p class="cabinet-description">${escapeHtml(armario.descricao)}</p>
            <div class="cabinet-stats">
                <div><span>Prateleiras</span><strong>${totalShelves}</strong></div>
                <div><span>Localizações</span><strong>${locations}</strong></div>
                <div><span>Produtos</span><strong>${products}</strong></div>
                <div><span>Ocupação</span><strong>${occupancy}%</strong></div>
            </div>
            <div class="shelf-grid">
                ${shelves.map(renderShelf).join("") || `<div class="locations-empty">Nenhuma prateleira encontrada.</div>`}
            </div>
        </article>
    `;
}

function renderFutureExpansion() {
    if (!locationMap) return;
    const items = locationMap.planejados.filter(futureVisible);
    byId("futureExpansion").innerHTML = items.map((item) => `
        <article class="future-card future-${escapeHtml(item.status)}">
            <div class="future-icon">${pixelAsset(`/assets/img/pixel-ops/dashboard/${item.codigo}.webp`, item.codigo)}</div>
            <div>
                <h3>${escapeHtml(item.codigo)}</h3>
                <p>${escapeHtml(item.nome)}</p>
                <span>${escapeHtml(item.status)}</span>
            </div>
        </article>
    `).join("") || `<div class="locations-empty">Nenhuma expansão encontrada.</div>`;
}

function renderAll() {
    renderOperationalMap();
    renderFutureExpansion();
}

async function loadLocationMap() {
    const { data } = await Api.get("/api/localizacoes/mapa");
    locationMap = data;
    renderAll();
}

(async function init() {
    await requireAuth();
    newLocationModal = new bootstrap.Modal(byId("newLocationModal"));
    shelfDetailModal = new bootstrap.Modal(byId("shelfDetailModal"));
    moveLocationModal = new bootstrap.Modal(byId("moveLocationModal"));
    editLocationModal = new bootstrap.Modal(byId("editLocationModal"));
    ["newLocationModal", "moveLocationModal", "editLocationModal"].forEach((modalId) => {
        byId(modalId).addEventListener("hidden.bs.modal", () => {
            maybeReopenShelfAfterChild().catch((error) => setAlert(error.message, "danger"));
        });
    });
    await loadLocationMap();

    const newButton = byId("newLocationButton");
    if (newButton) {
        newButton.addEventListener("click", () => openLocationModal());
    }

    byId("newShelfButton").addEventListener("click", openNewShelfConfig);

    byId("operationalMap").addEventListener("click", async (event) => {
        const addButton = event.target.closest("[data-new-location-shelf]");
        if (addButton) {
            const shelf = locationMap.armarios[0].prateleiras.find((item) => item.codigo === addButton.dataset.newLocationShelf);
            if (shelf) {
                try {
                    const { data } = await Api.get(`/api/localizacoes/prateleiras/ARM01/${encodeURIComponent(shelf.codigo)}/detalhe`);
                    openLocationModal({
                        shelf: data.prateleira,
                        nextOrder: data.proxima_ordem,
                        suggestedCode: data.codigo_sugerido,
                    });
                } catch (error) {
                    setAlert(error.message, "danger");
                }
            }
            return;
        }
        const button = event.target.closest("[data-shelf-code]");
        if (!button) return;
        try {
            await openShelfDetail(button.dataset.shelfCode);
        } catch (error) {
            setAlert(error.message, "danger");
        }
    });

    byId("shelfLocationList").addEventListener("click", (event) => {
        const editButton = event.target.closest("[data-edit-location-id]");
        if (editButton && activeShelfDetail) {
            const loc = activeShelfDetail.localizacoes.find((item) => String(item.id) === String(editButton.dataset.editLocationId));
            if (loc) openEditLocation(loc);
            return;
        }
        const moveButton = event.target.closest("[data-move-location-id]");
        if (moveButton && activeShelfDetail) {
            const loc = activeShelfDetail.localizacoes.find((item) => String(item.id) === String(moveButton.dataset.moveLocationId));
            if (loc) openMoveLocation(loc);
            return;
        }
        const button = event.target.closest("[data-new-location-for-shelf]");
        if (!button || !activeShelf) return;
        openLocationModal({
            shelf: activeShelf,
            nextOrder: activeShelfDetail ? activeShelfDetail.proxima_ordem : 0,
            suggestedCode: activeShelfDetail ? activeShelfDetail.codigo_sugerido : "",
            defaultName: "",
        });
    });

    byId("locationSearchForm").addEventListener("submit", (event) => {
        event.preventDefault();
        searchTerm = String(new FormData(event.currentTarget).get("q") || "").trim().toLowerCase();
        renderAll();
    });

    byId("locationSearchForm").addEventListener("input", (event) => {
        searchTerm = String(event.currentTarget.elements.q.value || "").trim().toLowerCase();
        renderAll();
    });

    byId("clearLocationSearch").addEventListener("click", () => {
        byId("locationSearchForm").reset();
        searchTerm = "";
        activeFilter = "todos";
        byId("locationFilterChips").querySelectorAll("[data-filter]").forEach((chip) => {
            chip.classList.toggle("active", chip.dataset.filter === "todos");
        });
        renderAll();
    });

    byId("locationFilterChips").addEventListener("click", (event) => {
        const chip = event.target.closest("[data-filter]");
        if (!chip) return;
        activeFilter = chip.dataset.filter;
        byId("locationFilterChips").querySelectorAll("[data-filter]").forEach((item) => {
            item.classList.toggle("active", item === chip);
        });
        renderAll();
    });

    ["nome", "armario", "prateleira"].forEach((field) => {
        byId("locationForm").elements[field].addEventListener("input", scheduleLocationCodeSuggestion);
        byId("locationForm").elements[field].addEventListener("change", scheduleLocationCodeSuggestion);
    });
    ["nome", "prateleira"].forEach((field) => {
        byId("editLocationForm").elements[field].addEventListener("input", scheduleEditLocationCodeSuggestion);
        byId("editLocationForm").elements[field].addEventListener("change", scheduleEditLocationCodeSuggestion);
    });

    byId("locationForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = byId("locationForm");
        try {
            await updateLocationCodeSuggestion();
            const { message } = await Api.post("/api/localizacoes", formDataObject(form));
            childModalSaved = true;
            form.reset();
            newLocationModal.hide();
            await loadLocationMap();
            if (locationContext && locationContext.shelf) {
                await openShelfDetail(locationContext.shelf.codigo, locationContext.shelf.armario);
            }
            childModalReturnShelf = null;
            locationContext = null;
            setAlert(message || "Localização criada.");
        } catch (error) {
            setAlert(error.message, "danger");
        }
    });

    byId("shelfConfigForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        const payload = formDataObject(byId("shelfConfigForm"));
        try {
            const request = payload.id
                ? Api.put(`/api/localizacoes/prateleiras/${payload.id}`, payload)
                : Api.post("/api/localizacoes/prateleiras", payload);
            const { message } = await request;
            await loadLocationMap();
            if (payload.id && activeShelf) {
                await openShelfDetail(activeShelf.codigo, activeShelf.armario);
            } else {
                shelfDetailModal.hide();
            }
            setAlert(message || "Prateleira salva.");
        } catch (error) {
            setAlert(error.message, "danger");
        }
    });

    byId("moveLocationForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        const payload = formDataObject(byId("moveLocationForm"));
        try {
            const { message } = await Api.post(`/api/localizacoes/${payload.id}/mover`, payload);
            childModalSaved = true;
            moveLocationModal.hide();
            await loadLocationMap();
            await reopenActiveShelf();
            childModalReturnShelf = null;
            setAlert(message || "Localização movida.");
        } catch (error) {
            setAlert(error.message, "danger");
        }
    });

    byId("deleteLocationButton").addEventListener("click", async () => {
        const form = byId("editLocationForm");
        const id = form.elements.id.value;
        const codigo = form.elements.codigo.value;
        if (!id) return;
        const confirmed = window.confirm(`Excluir a localização ${codigo}? Essa ação só será permitida se ela não tiver produtos vinculados.`);
        if (!confirmed) return;
        try {
            const { message } = await Api.delete(`/api/localizacoes/${id}`);
            childModalSaved = true;
            editLocationModal.hide();
            await loadLocationMap();
            await reopenActiveShelf();
            childModalReturnShelf = null;
            setAlert(message || "Localização removida.");
        } catch (error) {
            setAlert(error.message, "danger");
        }
    });

    byId("editLocationForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        const payload = formDataObject(byId("editLocationForm"));
        try {
            await updateEditLocationCodeSuggestion();
            const { message } = await Api.put(`/api/localizacoes/${payload.id}`, payload);
            childModalSaved = true;
            editLocationModal.hide();
            await loadLocationMap();
            await openShelfDetail(payload.prateleira || activeShelf.codigo, payload.armario || activeShelf.armario);
            childModalReturnShelf = null;
            setAlert(message || "Localização atualizada.");
        } catch (error) {
            setAlert(error.message, "danger");
        }
    });
})();
