mountNav("localizacoes");

async function loadLocations() {
    const { data } = await Api.get("/api/localizacoes");
    byId("locationRows").innerHTML = sortLocations(data.localizacoes).map((loc) => `
        <tr>
            <td><span class="fw-semibold">${escapeHtml(friendlyLocation(loc))}</span><div class="small text-secondary">${escapeHtml(loc.codigo)}</div></td>
            <td>${escapeHtml(loc.nome)}<div class="small text-secondary">${escapeHtml(loc.descricao || "")}</div></td>
            <td>${escapeHtml(friendlyArmario(loc.armario))} > ${escapeHtml(loc.prateleira)}</td>
            <td class="text-end">${loc.produtos_count} / ${loc.unidades_total}</td>
            <td class="text-end"><img class="qr-img border rounded" src="/api/etiquetas/localizacao/${encodeURIComponent(loc.codigo)}/qr.png" alt="QR Code"></td>
        </tr>
    `).join("") || `<tr><td colspan="5" class="text-secondary">Nenhuma localização cadastrada.</td></tr>`;
}

(async function init() {
    await requireAuth();
    await loadLocations();
    byId("locationForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        try {
            const { message } = await Api.post("/api/localizacoes", formDataObject(event.currentTarget));
            setAlert(message || "Localização criada.");
            event.currentTarget.reset();
            await loadLocations();
        } catch (error) {
            setAlert(error.message, "danger");
        }
    });
})();
