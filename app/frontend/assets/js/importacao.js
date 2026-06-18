mountNav("importacao");

(async function init() {
    await requireAuth();
    try {
        const { data } = await Api.get("/api/importacao/template");
        byId("headers").innerHTML = data.headers.map((header) => `<span class="badge text-bg-light border">${escapeHtml(header)}</span>`).join("");
    } catch (error) {
        setAlert(error.message, "danger");
    }

    byId("importForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        try {
            const { data, message } = await Api.upload("/api/importacao/produtos", formData);
            setAlert(message || "Importação finalizada.");
            byId("importResult").innerHTML = `
                <div class="fw-semibold mb-2">Criados: ${data.criados}</div>
                ${data.erros.length ? `<div class="table-responsive"><table class="table table-sm"><thead><tr><th>Linha</th><th>Erro</th></tr></thead><tbody>${data.erros.map((err) => `<tr><td>${err.linha}</td><td>${escapeHtml(err.erro)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="text-secondary">Nenhum erro encontrado.</div>`}
            `;
        } catch (error) {
            setAlert(error.message, "danger");
        }
    });
})();
