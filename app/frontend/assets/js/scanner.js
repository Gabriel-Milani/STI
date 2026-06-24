mountNav("scanner");

let lastError = { code: "", at: 0 };

function renderLocation(localizacao, produtos) {
    return `
        <div class="card shadow-sm"><div class="card-body">
            <h2 class="h4 mb-1">${escapeHtml(localizacao.nome)}</h2>
            <div class="text-secondary mb-3">${escapeHtml(localizacao.armario)} > ${escapeHtml(localizacao.prateleira)} · ${escapeHtml(localizacao.codigo)}</div>
            <div class="table-responsive"><table class="table table-sm mb-0"><thead><tr><th>Produto</th><th class="text-end">Qtd.</th></tr></thead><tbody>
                ${produtos.map((p) => `<tr><td><a href="/produtos/${encodeURIComponent(p.codigo)}">${escapeHtml(p.nome)}</a></td><td class="text-end">${p.quantidade_atual}</td></tr>`).join("") || `<tr><td colspan="2" class="text-secondary">Sem produtos.</td></tr>`}
            </tbody></table></div>
        </div></div>`;
}

function cleanScanCode(value) {
    return String(value || "")
        .replace(/[\u0000-\u001F\u007F]/g, "")
        .replace(/\s+/g, "")
        .trim()
        .toUpperCase();
}

function shouldShowScanError(code) {
    const now = Date.now();
    if (lastError.code === code && now - lastError.at < 1500) return false;
    lastError = { code, at: now };
    return true;
}

function productUrlFromScan(data) {
    if (data.tipo === "produto") {
        return `/produtos/${encodeURIComponent(data.produto.codigo)}`;
    }
    if (data.tipo === "unidade") {
        const productCode = encodeURIComponent(data.unidade.produto_codigo);
        const unitCode = encodeURIComponent(data.unidade.codigo_unidade);
        return `/produtos/${productCode}?unidade=${unitCode}`;
    }
    return null;
}

function focusScannerInput(form) {
    const input = form.querySelector("[name='codigo']");
    input.value = "";
    input.focus();
}

(async function init() {
    await requireAuth();
    const form = byId("scanForm");
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const codigo = cleanScanCode(new FormData(form).get("codigo"));
        if (!codigo || codigo.length < 2) {
            focusScannerInput(form);
            return;
        }

        try {
            const { data } = await Api.get(`/api/scanner/buscar/${encodeURIComponent(codigo)}`);
            const url = productUrlFromScan(data);
            if (url) {
                window.location.assign(url);
                return;
            }
            byId("scanResult").innerHTML = renderLocation(data.localizacao, data.produtos);
        } catch (error) {
            if (shouldShowScanError(codigo)) {
                setAlert(error.message, "danger");
            }
        } finally {
            focusScannerInput(form);
        }
    });
})();
