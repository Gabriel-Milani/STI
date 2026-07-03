const TerminalApi = (() => {
    async function request(path, options = {}) {
        const init = {
            credentials: "same-origin",
            headers: {},
            ...options,
        };
        if (init.body && !(init.body instanceof FormData) && !init.headers["Content-Type"] && !init.headers["content-type"]) {
            init.headers["Content-Type"] = "application/json";
        }
        const response = await fetch(path, init);
        const payload = await response.json().catch(() => ({ ok: false, error: "Resposta inválida do servidor." }));
        if (!response.ok || !payload.ok) {
            const error = new Error(payload.error || "Operação não concluída.");
            error.status = response.status;
            throw error;
        }
        return payload;
    }

    return {
        async status() {
            return request("/api/terminal/status");
        },
        async scan(code) {
            return request(`/api/terminal/scan/${encodeURIComponent(code)}`);
        },
        async action(payload) {
            return request("/api/terminal/action", { method: "POST", body: JSON.stringify(payload) });
        },
    };
})();
