mountNav("produtos");

let locations = [];
let selectedShelf = "";
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

function shelfKey(loc) {
    return `${loc.armario}|${loc.prateleira}`;
}

function shelfLabel(key) {
    const [armario, prateleira] = key.split("|");
    return `${friendlyArmario(armario)} > ${prateleira}`;
}

function renderShelves() {
    const shelves = [...new Map(locations.map((loc) => [shelfKey(loc), loc])).keys()];
    if (!selectedShelf && shelves.length) selectedShelf = shelves[0];
    byId("shelfOptions").innerHTML = shelves.map((key) => `
        <button class="location-choice ${key === selectedShelf ? "active" : ""}" type="button" data-shelf="${escapeHtml(key)}">
            <span class="fw-semibold">${escapeHtml(shelfLabel(key))}</span>
            <span class="small text-secondary">${locations.filter((loc) => shelfKey(loc) === key).length} opções</span>
        </button>
    `).join("") || `<div class="text-secondary">Nenhuma prateleira cadastrada.</div>`;
}

function renderLocations() {
    const selected = byId("selectedLocation").value;
    const shelfLocations = locations.filter((loc) => shelfKey(loc) === selectedShelf);
    byId("locationCards").innerHTML = shelfLocations.map((loc) => `
        <button class="location-choice ${loc.codigo === selected ? "active" : ""}" type="button" data-location="${escapeHtml(loc.codigo)}">
            <span class="fw-semibold">${escapeHtml(loc.nome)}</span>
            <span class="small text-secondary">${escapeHtml(loc.codigo)} · ${loc.produtos_count} produtos</span>
        </button>
    `).join("") || `<div class="text-secondary">Nenhuma localização nessa prateleira.</div>`;
}

async function loadLocations() {
    const { data } = await Api.get("/api/localizacoes");
    locations = sortLocations(data.localizacoes);
    renderShelves();
    renderLocations();
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
    renderCategorySelect("categorySelect");
    try {
        const { data } = await Api.get("/api/produtos/categorias");
        categories = data.categorias?.length ? data.categorias : DEFAULT_CATEGORIES;
    } catch (_error) {
        categories = DEFAULT_CATEGORIES;
    }
    renderCategorySelect("categorySelect");
}

(async function init() {
    await requireAuth();
    await Promise.all([loadCategories(), loadLocations()]);

    byId("shelfOptions").addEventListener("click", (event) => {
        const button = event.target.closest("[data-shelf]");
        if (!button) return;
        selectedShelf = button.dataset.shelf;
        byId("selectedLocation").value = "";
        renderShelves();
        renderLocations();
    });

    byId("locationCards").addEventListener("click", (event) => {
        const button = event.target.closest("[data-location]");
        if (!button) return;
        byId("selectedLocation").value = button.dataset.location;
        renderLocations();
    });

    byId("productForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!byId("selectedLocation").value) {
            setAlert("Escolha uma localização para o produto.", "danger");
            return;
        }
        try {
            const { data } = await Api.post("/api/produtos", formDataObject(event.currentTarget));
            window.location.href = `/produtos/${encodeURIComponent(data.codigo)}`;
        } catch (error) {
            setAlert(error.message, "danger");
        }
    });
})();
