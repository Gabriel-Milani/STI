mountNav("importacao");

(async function init() {
    await requireAuth();
    try {
        byId("headers").innerHTML = Array.from({ length: 7 }).map(() => `<span class="import-header-chip ops-skeleton-card"><span class="ops-skeleton-line"></span></span>`).join("");
        const { data } = await Api.get("/api/importacao/template");
        byId("headers").innerHTML = data.headers.map((header) => `<span class="import-header-chip">${escapeHtml(header)}</span>`).join("");
    } catch (error) {
        setAlert(error.message, "danger");
    }

    byId("importForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const submit = byId("importButton");
        submit.disabled = true;
        submit.textContent = "Importando...";
        try {
            const { data, message } = await Api.upload("/api/importacao/produtos", formData);
            setAlert(message || "Importação finalizada.");
            byId("importResult").innerHTML = `
                <div class="import-result-summary">Criados: <strong>${data.criados}</strong></div>
                ${data.erros.length ? `<div class="table-responsive"><table class="table table-sm ops-data-table"><thead><tr><th>Linha</th><th>Erro</th></tr></thead><tbody>${data.erros.map((err) => `<tr><td>${err.linha}</td><td>${escapeHtml(err.erro)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="ops-empty-state import-empty-state">Nenhum erro encontrado.</div>`}
            `;
        } catch (error) {
            setAlert(error.message, "danger");
        } finally {
            submit.disabled = false;
            submit.textContent = "Importar";
        }
    });
})();
