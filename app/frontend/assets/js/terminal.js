(function () {
    const state = {
        currentItem: null,
        pendingAction: null,
    };

    function updateClock() {
        const time = document.getElementById("terminalTime");
        if (time) time.textContent = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    }

    function initFullscreen() {
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => {});
        }
        if (screen.orientation && screen.orientation.lock) {
            screen.orientation.lock("portrait").catch(() => {});
        }
    }

    async function startScanner() {
        try {
            await TerminalScanner.start({
                targetId: "scannerViewport",
                onDecode: async (code) => {
                    TerminalUI.showLoader("Lendo QR...");
                    try {
                        const result = await TerminalApi.scan(code);
                        state.currentItem = result.data;
                        if (result.data?.tipo === "produto") {
                            renderProductCard(result.data.produto);
                        } else if (result.data?.tipo === "localizacao") {
                            renderLocationCard(result.data.localizacao);
                        } else if (result.data?.tipo === "usuario") {
                            renderUserCard(result.data.usuario);
                        }
                        TerminalUI.showToast("Item localizado", "success");
                    } catch (error) {
                        TerminalUI.showToast(error.message || "Falha ao localizar item", "error");
                    }
                    setTimeout(() => {
                        startScanner().catch(() => {});
                    }, 1800);
                },
            });
        } catch (error) {
            TerminalUI.showToast(error.message || "Não foi possível iniciar a câmera", "error");
        }
    }

    async function bootstrap() {
        updateClock();
        setInterval(updateClock, 1000);
        initFullscreen();
        const userName = document.getElementById("terminalUserName");
        try {
            const status = await TerminalApi.status();
            if (userName) userName.textContent = status.data?.usuario_logado?.nome || status.data?.usuario_logado?.username || "Operador";
            document.getElementById("terminalVersion").textContent = `v${status.data?.versao || "1.0.0"}`;
            document.getElementById("terminalConnection").textContent = status.data?.scanner_ativo ? "Conexão OK" : "Conexão OFF";
        } catch (error) {
            console.error(error);
        }

        await startScanner();
    }

    function renderProductCard(product) {
        const card = `
            <div class="label">Produto</div>
            <h2>${product.nome || "Sem nome"}</h2>
            <div class="value">${product.modelo || "-"}</div>
            <div class="value">Status: ${product.quantidade_atual > 0 ? "Disponível" : "Sem estoque"}</div>
            <div class="value">Localização: ${product.localizacao_label || "-"}</div>
            <div class="value">Quantidade: ${product.quantidade_atual ?? 0}</div>
            <div class="terminal-actions">
                <button class="btn btn-primary" data-action="retirar">Retirar</button>
                <button class="btn btn-primary" data-action="emprestar">Emprestar</button>
                <button class="btn btn-primary" data-action="devolver">Devolver</button>
                <button class="btn btn-primary" data-action="mover">Mover</button>
                <button class="btn btn-primary" data-action="consultar">Consultar</button>
                <button class="btn btn-danger" data-action="cancelar">Cancelar</button>
            </div>`;
        TerminalUI.showCard(card);
        TerminalUI.setState("Produto encontrado", "Escolha a ação desejada", "✅");
        attachActions();
    }

    function renderLocationCard(location) {
        const card = `
            <div class="label">Localização</div>
            <h2>${location.nome || "Localização"}</h2>
            <div class="value">${location.label || "-"}</div>
            <div class="terminal-actions">
                <button class="btn btn-primary" data-action="cancelar">Voltar</button>
            </div>`;
        TerminalUI.showCard(card);
        TerminalUI.setState("Localização detectada", "Pronta para movimentação", "📍");
    }

    function renderUserCard(user) {
        const card = `
            <div class="label">Usuário</div>
            <h2>${user.nome || user.username || "Usuário"}</h2>
            <div class="value">${user.username || "-"}</div>
            <div class="terminal-actions">
                <button class="btn btn-primary" data-action="cancelar">Voltar</button>
            </div>`;
        TerminalUI.showCard(card);
        TerminalUI.setState("Usuário identificado", "Operação autorizada", "👤");
    }

    function attachActions() {
        document.querySelectorAll("[data-action]").forEach((button) => {
            button.addEventListener("click", async () => {
                const action = button.getAttribute("data-action");
                if (action === "cancelar") {
                    TerminalUI.hideCard();
                    TerminalUI.setState("Aguardando leitura", "Posicione o QR do produto ou da localização.", "📷");
                    return;
                }
                if (action === "consultar") {
                    await performAction("consultar");
                    return;
                }
                if (action === "retirar" || action === "emprestar" || action === "devolver" || action === "mover") {
                    renderActionForm(action);
                    return;
                }
                if (action === "submit-action") {
                    await performAction(state.pendingAction);
                    return;
                }
            });
        });
    }

    function renderActionForm(action) {
        state.pendingAction = action;
        const title = {
            retirar: "Retirada",
            emprestar: "Empréstimo",
            devolver: "Devolução",
            mover: "Mover localização",
        }[action] || "Operação";
        const extraFields = action === "emprestar"
            ? `<label class="value"><span>Data prevista</span><input id="terminalActionDate" type="date"></label>`
            : "";
        const destinationField = action === "mover"
            ? `<label class="value"><span>Nova localização</span><input id="terminalActionDestination" type="text" placeholder="Ex.: ARM01-P1"></label>`
            : "";
        const card = `
            <div class="label">${title}</div>
            <h2>${state.currentItem?.produto?.nome || "Item"}</h2>
            <label class="value"><span>Usuário</span><input id="terminalActionUser" type="text" placeholder="Nome do usuário"></label>
            ${extraFields}
            ${destinationField}
            <label class="value"><span>Observação</span><textarea id="terminalActionNote" rows="3" placeholder="Opcional"></textarea></label>
            <div class="terminal-actions">
                <button class="btn btn-primary" data-action="submit-action">Confirmar</button>
                <button class="btn btn-danger" data-action="cancelar">Cancelar</button>
            </div>`;
        TerminalUI.showCard(card);
        TerminalUI.setState("Confirmar ação", "Complete os campos e confirme", "⚙️");
        attachActions();
    }

    async function performAction(action) {
        TerminalUI.showLoader("Registrando...");
        try {
            const payload = { action, codigo: state.currentItem?.produto?.codigo };
            if (action !== "consultar") {
                payload.usuario = document.getElementById("terminalActionUser")?.value?.trim() || "Operador";
                payload.observacao = document.getElementById("terminalActionNote")?.value?.trim() || "";
                if (action === "emprestar") payload.data_prevista = document.getElementById("terminalActionDate")?.value || "";
                if (action === "mover") payload.destino = document.getElementById("terminalActionDestination")?.value?.trim() || "";
            }
            const response = await TerminalApi.action(payload);
            TerminalUI.showToast(response.data?.mensagem || "Operação concluída", "success");
            TerminalUI.hideCard();
            TerminalUI.setState("Operação realizada", "Retornando para a câmera", "✅");
            setTimeout(() => {
                TerminalUI.setState("Aguardando leitura", "Posicione o QR do produto ou da localização.", "📷");
            }, 1600);
        } catch (error) {
            TerminalUI.showToast(error.message || "Falha na operação", "error");
            TerminalUI.hideCard();
        }
    }

    document.addEventListener("DOMContentLoaded", bootstrap);
})();
