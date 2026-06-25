mountNav("scanner");

let lastError = { code: "", at: 0 };

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

        const submit = form.querySelector("button[type='submit']");
        submit.disabled = true;
        submit.textContent = "Buscando...";
        try {
            const { data } = await Api.get(`/api/scanner/buscar/${encodeURIComponent(codigo)}`);
            const url = productUrlFromScan(data);
            if (url) {
                window.location.assign(url);
                return;
            }
            byId("scanResult").innerHTML = "";
        } catch (error) {
            if (shouldShowScanError(codigo)) {
                setAlert(error.message, "danger");
            }
        } finally {
            submit.disabled = false;
            submit.textContent = "Buscar";
            focusScannerInput(form);
        }
    });
})();
