(() => {
    const state = {
        currentItem: null, // Scanned item response data
        pendingAction: null, // "retirar", "emprestar", "devolver", "mover", "entrada"
        activeUsers: [], // Active users list for dropdowns
        waitingForLocationScan: false, // Flag for Mover flow
        newLocation: null // Target location for Mover flow
    };

    // Helper functions to play sound alerts
    function playSound(type) {
        const audio = document.getElementById(`sound${type.charAt(0).toUpperCase() + type.slice(1)}`);
        if (audio) {
            audio.currentTime = 0;
            audio.play().catch(err => console.warn("Audio play prevented:", err));
        }
    }

function updateClock() {
    const time = document.getElementById("terminalTime");
    if (time) {
        // Formata a hora diretamente no fuso de São Paulo
        const formatoBrasilia = new Intl.DateTimeFormat("pt-BR", {
            timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit"
        });
        
        time.textContent = formatoBrasilia.format(new Date());
    }
}
setInterval(updateClock, 1000);

    function initFullscreen() {
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => {});
        }
        if (screen.orientation && screen.orientation.lock) {
            screen.orientation.lock("portrait").catch(() => {});
        }
    }

    // Lock fullscreen and orientation on first user interaction
    document.addEventListener("click", () => {
        initFullscreen();
    }, { once: true });

    async function startScanner() {
        try {
            await TerminalScanner.start({
                targetId: "scannerViewport",
                onDecode: async (code) => {
                    // Pause/stop scanner upon reading code
                    await TerminalScanner.stop();
                    playSound("scan");

                    if (state.waitingForLocationScan) {
                        await handleLocationScanForMove(code);
                    } else {
                        await handleStandardScan(code);
                    }
                }
            });
        } catch (error) {
            TerminalUI.showToast(error.message || "Não foi possível iniciar a câmera", "error");
            playSound("error");
        }
    }

    // Handles the second scan in the move flow (scanning target location)
    async function handleLocationScanForMove(code) {
        TerminalUI.showLoader("Validando localização...");
        try {
            const response = await TerminalApi.scan(code);
            if (response.data?.tipo === "localizacao") {
                state.newLocation = response.data.localizacao;
                playSound("success");
                renderMoverConfirmation();
            } else {
                throw new Error("O código escaneado não é uma localização válida.");
            }
        } catch (error) {
            TerminalUI.showToast(error.message || "Localização inválida", "error");
            playSound("error");
            // Revert state and show the product card again
            state.waitingForLocationScan = false;
            state.newLocation = null;
            if (state.currentItem && state.currentItem.tipo === "produto") {
                renderProductCard(state.currentItem.produto);
            } else {
                resetToIdle();
            }
        }
    }

    // Handles standard scans (products, locations, users)
    async function handleStandardScan(code) {
        TerminalUI.showLoader("Buscando...");
        try {
            const response = await TerminalApi.scan(code);
            state.currentItem = response.data;

            if (response.data?.tipo === "produto") {
                playSound("success");
                renderProductCard(response.data.produto);
            } else if (response.data?.tipo === "localizacao") {
                playSound("success");
                renderLocationCard(response.data.localizacao);
            } else if (response.data?.tipo === "usuario") {
                playSound("success");
                renderUserCard(response.data.usuario);
            } else {
                throw new Error("Tipo de item não identificado.");
            }
        } catch (error) {
            TerminalUI.showToast(error.message || "Código não encontrado", "error");
            playSound("error");
            resetToIdleDelayed(2500);
        }
    }

    function resetToIdle() {
        state.currentItem = null;
        state.pendingAction = null;
        state.waitingForLocationScan = false;
        state.newLocation = null;
        TerminalUI.hideCard();
        TerminalUI.setState("Aguardando leitura", "Posicione o QR do produto ou da localização.", "📷");
        startScanner().catch(() => {});
    }

    function resetToIdleDelayed(delayMs) {
        TerminalUI.hideCard();
        setTimeout(() => {
            resetToIdle();
        }, delayMs);
    }

    function buildUserSelectHTML(selectId) {
        if (!state.activeUsers || state.activeUsers.length === 0) {
            return `<input id="${selectId}" type="text" placeholder="Nome do responsável" required class="terminal-input">`;
        }
        const options = state.activeUsers.map(user => 
            `<option value="${user.nome || user.username}">${escapeHTML(user.nome || user.username)}</option>`
        ).join("");
        return `<select id="${selectId}" class="terminal-select" required>
            <option value="" disabled selected>Selecione o responsável...</option>
            ${options}
        </select>`;
    }

    function escapeHTML(str) {
        return String(str || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Build the quantity stepper widget HTML
    function buildQtyStepper(defaultQty, maxQty) {
        const max = maxQty > 0 ? maxQty : 999;
        return `
            <div class="form-group">
                <span class="qty-label">Quantidade</span>
                <div class="qty-stepper" data-max="${max}">
                    <button type="button" class="qty-btn qty-minus">−</button>
                    <div class="qty-display" id="qtyDisplay">${defaultQty}</div>
                    <button type="button" class="qty-btn qty-plus">+</button>
                </div>
                <input type="hidden" id="terminalActionQty" value="${defaultQty}">
            </div>
        `;
    }

    // Attach qty stepper event listeners
    function attachQtyStepperListeners() {
        const wrapper = document.querySelector(".qty-stepper");
        if (!wrapper) return;

        const display = document.getElementById("qtyDisplay");
        const hiddenInput = document.getElementById("terminalActionQty");
        const max = parseInt(wrapper.dataset.max, 10) || 999;

        wrapper.querySelector(".qty-minus").addEventListener("click", () => {
            let val = parseInt(hiddenInput.value, 10) || 1;
            if (val > 1) {
                val--;
                hiddenInput.value = val;
                display.textContent = val;
            }
        });

        wrapper.querySelector(".qty-plus").addEventListener("click", () => {
            let val = parseInt(hiddenInput.value, 10) || 1;
            if (val < max) {
                val++;
                hiddenInput.value = val;
                display.textContent = val;
            }
        });
    }

    function renderProductCard(product) {
        state.pendingAction = null;
        const isBorrowed = !!product.emprestimo_ativo;

        let loanInfoHTML = "";
        let actionsHTML = "";

        if (isBorrowed) {
            const loan = product.emprestimo_ativo;
            const loanDate = loan.data_emprestimo ? new Date(loan.data_emprestimo).toLocaleDateString("pt-BR") : "-";
            loanInfoHTML = `
                <div class="terminal-loan-alert">
                    <span class="alert-icon">⚠</span>
                    <div class="alert-body">
                        <strong>Item Emprestado</strong>
                        <p>Responsável: ${escapeHTML(loan.emprestado_para)}</p>
                        <p>Data: ${loanDate}</p>
                    </div>
                </div>
            `;

            actionsHTML = `
                <button class="btn btn-success btn-large" data-action="devolver">DEVOLVER</button>
                <button class="btn btn-primary" data-action="consultar">CONSULTAR</button>
                <button class="btn btn-danger" data-action="cancelar">Cancelar</button>
            `;
        } else {
            actionsHTML = `
                <button class="btn btn-warning" data-action="entrada">+ ADICIONAR</button>
                <button class="btn btn-primary" data-action="retirar">RETIRAR</button>
                <button class="btn btn-primary" data-action="emprestar">EMPRESTAR</button>
                <button class="btn btn-primary" data-action="mover">MOVER</button>
                <button class="btn btn-primary" data-action="consultar">CONSULTAR</button>
                <button class="btn btn-danger" data-action="cancelar">Cancelar</button>
            `;
        }

        const card = `
            <div class="terminal-card-header">
                <span class="card-kicker">PRODUTO ENCONTRADO</span>
                <h2>${escapeHTML(product.nome)}</h2>
            </div>
            <div class="terminal-card-body">
                <div class="info-row"><span class="label">Modelo:</span><span class="value">${escapeHTML(product.modelo || "-")}</span></div>
                <div class="info-row"><span class="label">Código:</span><span class="value font-mono">${escapeHTML(product.codigo)}</span></div>
                <div class="info-row"><span class="label">Localização:</span><span class="value">${escapeHTML(product.localizacao_label || "-")}</span></div>
                <div class="info-row"><span class="label">Qtd Atual:</span><span class="value highlight">${product.quantidade_atual ?? 0}</span></div>
                ${loanInfoHTML}
            </div>
            <div class="terminal-actions layout-grid-${isBorrowed ? '3' : '6'}">
                ${actionsHTML}
            </div>
        `;

        TerminalUI.showCard(card);
        TerminalUI.setState("Produto encontrado", "Escolha a ação desejada no painel abaixo.", "📦");
        attachCardButtonListeners(product);
    }

    function renderLocationCard(location) {
        const card = `
            <div class="terminal-card-header">
                <span class="card-kicker">LOCALIZAÇÃO DETECTADA</span>
                <h2>${escapeHTML(location.nome)}</h2>
            </div>
            <div class="terminal-card-body">
                <div class="info-row"><span class="label">Código:</span><span class="value font-mono">${escapeHTML(location.codigo)}</span></div>
                <div class="info-row"><span class="label">Estrutura:</span><span class="value">${escapeHTML(location.label || "-")}</span></div>
                <div class="info-row"><span class="label">Armário:</span><span class="value">${escapeHTML(location.armario || "-")}</span></div>
                <div class="info-row"><span class="label">Prateleira:</span><span class="value">${escapeHTML(location.prateleira || "-")}</span></div>
            </div>
            <div class="terminal-actions layout-grid-1">
                <button class="btn btn-danger btn-large" data-action="cancelar">Voltar</button>
            </div>
        `;
        TerminalUI.showCard(card);
        TerminalUI.setState("Localização detectada", "Informações da área do estoque.", "📍");
        attachCardButtonListeners();
    }

    function renderUserCard(user) {
        const card = `
            <div class="terminal-card-header">
                <span class="card-kicker">USUÁRIO IDENTIFICADO</span>
                <h2>${escapeHTML(user.nome)}</h2>
            </div>
            <div class="terminal-card-body">
                <div class="info-row"><span class="label">Nome de Usuário:</span><span class="value font-mono">${escapeHTML(user.username)}</span></div>
                <div class="info-row"><span class="label">Perfil de Acesso:</span><span class="value">${escapeHTML(user.perfil || "-")}</span></div>
                <div class="info-row"><span class="label">Situação:</span><span class="value">${user.ativo ? "Ativo" : "Inativo"}</span></div>
            </div>
            <div class="terminal-actions layout-grid-1">
                <button class="btn btn-danger btn-large" data-action="cancelar">Voltar</button>
            </div>
        `;
        TerminalUI.showCard(card);
        TerminalUI.setState("Usuário identificado", "Informações da conta de acesso.", "👤");
        attachCardButtonListeners();
    }

    function attachCardButtonListeners(product = null) {
        document.querySelectorAll("[data-action]").forEach(button => {
            button.addEventListener("click", async () => {
                const action = button.getAttribute("data-action");

                if (action === "cancelar") {
                    resetToIdle();
                    return;
                }

                if (action === "devolver") {
                    await handleDevolucaoDirect(product);
                    return;
                }

                if (action === "consultar") {
                    await handleConsultar(product);
                    return;
                }

                if (action === "retirar" || action === "emprestar" || action === "entrada") {
                    renderActionForm(action, product);
                    return;
                }

                if (action === "mover") {
                    handleMoverInitiate();
                    return;
                }
            });
        });
    }

    function renderActionForm(action, product) {
        state.pendingAction = action;

        const titles = {
            retirar: "REGISTRAR RETIRADA",
            emprestar: "REGISTRAR EMPRÉSTIMO",
            entrada: "ADICIONAR AO ESTOQUE"
        };
        const title = titles[action] || "OPERAÇÃO";

        // Qty stepper: for retirada/empréstimo, max is current stock. For entrada, no practical limit.
        const maxQty = (action === "retirar" || action === "emprestar")
            ? (product.quantidade_atual || 1)
            : 999;
        const qtyStepper = buildQtyStepper(1, maxQty);

        // User select (not needed for entrada)
        let userField = "";
        if (action !== "entrada") {
            userField = `
                <div class="form-group">
                    <label class="form-label" for="terminalActionUser">Usuário Destinatário *</label>
                    ${buildUserSelectHTML("terminalActionUser")}
                </div>
            `;
        }

        // Date field for empréstimo
        let extraFields = "";
        if (action === "emprestar") {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 7);
            const tomorrowStr = tomorrow.toISOString().split("T")[0];
            extraFields = `
                <div class="form-group">
                    <label class="form-label" for="terminalActionDate">Data Prevista de Retorno *</label>
                    <input id="terminalActionDate" type="date" class="terminal-input" required value="${tomorrowStr}">
                </div>
            `;
        }

        const card = `
            <div class="terminal-card-header">
                <span class="card-kicker">${title}</span>
                <h2>${escapeHTML(product.nome)}</h2>
            </div>
            <div class="terminal-card-body">
                <form id="terminalActionForm">
                    ${qtyStepper}
                    ${userField}
                    ${extraFields}
                    <div class="form-group">
                        <label class="form-label" for="terminalActionNote">Observação Opcional</label>
                        <textarea id="terminalActionNote" rows="2" class="terminal-textarea" placeholder="Observações operacionais..."></textarea>
                    </div>
                </form>
            </div>
            <div class="terminal-actions layout-grid-2">
                <button class="btn btn-success btn-large" id="btnConfirmAction">CONFIRMAR</button>
                <button class="btn btn-danger btn-large" id="btnCancelAction">Voltar</button>
            </div>
        `;

        TerminalUI.showCard(card);
        TerminalUI.setState("Preencher detalhes", "Insira as informações operacionais.", "⚙️");

        // Attach qty stepper listeners
        attachQtyStepperListeners();

        document.getElementById("btnCancelAction").addEventListener("click", () => {
            renderProductCard(product);
        });

        document.getElementById("btnConfirmAction").addEventListener("click", async () => {
            const qtyVal = parseInt(document.getElementById("terminalActionQty").value, 10) || 1;

            if (action !== "entrada") {
                const userField = document.getElementById("terminalActionUser");
                const userVal = userField.value;

                if (!userVal) {
                    TerminalUI.showToast("Informe o usuário responsável.", "error");
                    playSound("error");
                    userField.focus();
                    return;
                }

                let dateVal = "";
                if (action === "emprestar") {
                    const dateField = document.getElementById("terminalActionDate");
                    dateVal = dateField.value;
                    if (!dateVal) {
                        TerminalUI.showToast("Selecione a data prevista de retorno.", "error");
                        playSound("error");
                        dateField.focus();
                        return;
                    }
                }

                const noteVal = document.getElementById("terminalActionNote").value.trim();

                await submitAction(action, product.codigo, {
                    usuario: userVal,
                    quantidade: qtyVal,
                    data_prevista: dateVal,
                    observacao: noteVal
                });
            } else {
                // Entrada (add stock)
                const noteVal = document.getElementById("terminalActionNote").value.trim();
                await submitAction("entrada", product.codigo, {
                    quantidade: qtyVal,
                    observacao: noteVal
                });
            }
        });
    }

    async function submitAction(action, codigo, payload) {
        TerminalUI.showLoader("Registrando...");
        try {
            const data = {
                action: action,
                codigo: codigo,
                ...payload
            };
            const response = await TerminalApi.action(data);
            playSound("success");
            TerminalUI.showToast(response.data?.mensagem || "Operação realizada com sucesso!", "success");
            TerminalUI.hideCard();
            TerminalUI.setState("Operação realizada", "Retornando para a câmera...", "✅");
            resetToIdleDelayed(2000);
        } catch (error) {
            TerminalUI.showToast(error.message || "Erro ao registrar operação", "error");
            playSound("error");
            // Do not hide the form card on error, let the operator retry or cancel
            if (state.currentItem && state.currentItem.tipo === "produto") {
                TerminalUI.setState("Erro na operação", "Verifique os dados e tente novamente.", "❌");
            }
        }
    }

    async function handleDevolucaoDirect(product) {
        TerminalUI.showLoader("Registrando devolução...");
        try {
            const response = await TerminalApi.action({
                action: "devolver",
                codigo: product.codigo
            });
            playSound("success");
            TerminalUI.showToast(response.data?.mensagem || "Devolução registrada com sucesso!", "success");
            TerminalUI.hideCard();
            TerminalUI.setState("Operação realizada", "Item retornado ao estoque. Voltando para a câmera...", "✅");
            resetToIdleDelayed(2000);
        } catch (error) {
            TerminalUI.showToast(error.message || "Erro ao registrar devolução", "error");
            playSound("error");
            renderProductCard(product);
        }
    }

    function handleMoverInitiate() {
        state.waitingForLocationScan = true;
        state.newLocation = null;
        TerminalUI.hideCard();
        TerminalUI.setState("Aguardando localização", "Escaneie o QR Code da nova localização...", "📍");
        startScanner().catch(() => {});
    }

    function renderMoverConfirmation() {
        const product = state.currentItem.produto;
        const newLoc = state.newLocation;

        const card = `
            <div class="terminal-card-header">
                <span class="card-kicker">MOVER LOCALIZAÇÃO</span>
                <h2>${escapeHTML(product.nome)}</h2>
            </div>
            <div class="terminal-card-body">
                <div class="info-row"><span class="label">Origem:</span><span class="value">${escapeHTML(product.localizacao_label || "Sem local fixa")}</span></div>
                <div class="info-row"><span class="label">Destino:</span><span class="value highlight">${escapeHTML(newLoc.label || newLoc.nome)}</span></div>
                <div class="form-group" style="margin-top:0.5rem;">
                    <label class="form-label" for="terminalMoveNote">Observação Opcional</label>
                    <textarea id="terminalMoveNote" rows="2" class="terminal-textarea" placeholder="Ex.: Remanejamento de prateleira..."></textarea>
                </div>
            </div>
            <div class="terminal-actions layout-grid-2">
                <button class="btn btn-success btn-large" id="btnConfirmMove">CONFIRMAR</button>
                <button class="btn btn-danger btn-large" id="btnCancelMove">Cancelar</button>
            </div>
        `;

        TerminalUI.showCard(card);
        TerminalUI.setState("Confirmar mudança", "Confirme a movimentação no estoque físico.", "⚙️");

        document.getElementById("btnCancelMove").addEventListener("click", () => {
            state.waitingForLocationScan = false;
            state.newLocation = null;
            renderProductCard(product);
        });

        document.getElementById("btnConfirmMove").addEventListener("click", async () => {
            const noteVal = document.getElementById("terminalMoveNote").value.trim();
            await submitAction("mover", product.codigo, {
                destino: newLoc.codigo,
                observacao: noteVal
            });
        });
    }

    async function handleConsultar(product) {
        TerminalUI.showLoader("Consultando histórico...");
        try {
            const response = await TerminalApi.action({
                action: "consultar",
                codigo: product.codigo
            });
            playSound("success");
            renderConsultationCard(response.data.produto, response.data.historico || []);
        } catch (error) {
            TerminalUI.showToast(error.message || "Erro ao consultar histórico", "error");
            playSound("error");
            renderProductCard(product);
        }
    }

    function renderConsultationCard(product, history) {
        let historyHTML = "";
        if (history && history.length > 0) {
            const items = history.map(item => {
                const date = item.data_hora ? new Date(item.data_hora + "Z").toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-";
                const typeLabels = {
                    entrada: "Entrada",
                    retirada: "Retirada",
                    emprestimo: "Empréstimo",
                    devolucao: "Devolução",
                    descarte: "Descarte",
                    mover: "Mover"
                };
                const badgeClass = `badge-${item.tipo}`;
                const detail = item.observacao ? `<span class="hist-obs">${escapeHTML(item.observacao)}</span>` : "";
                const responsible = item.responsavel_destino || item.responsavel_origem || "";
                const respText = responsible ? `<span class="hist-resp">(${escapeHTML(responsible)})</span>` : "";

                return `
                    <div class="history-item">
                        <span class="hist-date">${date}</span>
                        <span class="hist-badge ${badgeClass}">${typeLabels[item.tipo] || item.tipo}</span>
                        <span class="hist-qty">${item.tipo === "mover" ? "-" : (item.tipo === "entrada" || item.tipo === "devolucao" ? "+" : "-") + item.quantidade}</span>
                        ${respText}
                        ${detail}
                    </div>
                `;
            }).join("");
            historyHTML = `<div class="history-list">${items}</div>`;
        } else {
            historyHTML = `<div class="history-empty">Nenhuma movimentação registrada recentemente.</div>`;
        }

        const card = `
            <div class="terminal-card-header">
                <span class="card-kicker">CONSULTA DETALHADA</span>
                <h2>${escapeHTML(product.nome)}</h2>
            </div>
            <div class="terminal-card-body scrollable-card-body">
                <div class="info-grid">
                    <div class="info-row"><span class="label">Modelo:</span><span class="value">${escapeHTML(product.modelo || "-")}</span></div>
                    <div class="info-row"><span class="label">Código:</span><span class="value font-mono">${escapeHTML(product.codigo)}</span></div>
                    <div class="info-row"><span class="label">Categoria:</span><span class="value">${escapeHTML(product.categoria || "-")}</span></div>
                    <div class="info-row"><span class="label">Marca:</span><span class="value">${escapeHTML(product.marca || "-")}</span></div>
                    <div class="info-row"><span class="label">Localização:</span><span class="value">${escapeHTML(product.localizacao_label || "-")}</span></div>
                    <div class="info-row"><span class="label">Qtd Atual:</span><span class="value highlight">${product.quantidade_atual ?? 0}</span></div>
                    <div class="info-row"><span class="label">Mínimo:</span><span class="value">${product.estoque_minimo ?? 0}</span></div>
                </div>
                <div class="history-section">
                    <h3>Histórico Resumido (últimos 5 logs)</h3>
                    ${historyHTML}
                </div>
            </div>
            <div class="terminal-actions layout-grid-1">
                <button class="btn btn-danger btn-large" id="btnBackFromConsult">Voltar</button>
            </div>
        `;

        TerminalUI.showCard(card);
        TerminalUI.setState("Ficha de consulta", "Consulta de dados e logs do item.", "🔍");

        document.getElementById("btnBackFromConsult").addEventListener("click", () => {
            renderProductCard(product);
        });
    }

    async function bootstrap() {
        updateClock();
        setInterval(updateClock, 1000);

        const userName = document.getElementById("terminalUserName");

        if (window.isSecureContext === false) {
            TerminalUI.showToast("Câmera bloqueada: HTTPS ou localhost é obrigatório.", "error");
            TerminalUI.setState("Câmera Bloqueada", "Navegadores móveis exigem conexão segura (HTTPS) para habilitar a câmera.", "🔒");
            playSound("error");
            
            try {
                const status = await TerminalApi.status();
                if (userName) userName.textContent = status.data?.usuario_logado?.nome || status.data?.usuario_logado?.username || "Operador";
                document.getElementById("terminalVersion").textContent = `v${status.data?.versao || "1.0.0"}`;
                document.getElementById("terminalConnection").textContent = status.data?.scanner_ativo ? "ONLINE" : "OFFLINE";
            } catch (e) {
                console.error(e);
            }
            return;
        }

        try {
            const status = await TerminalApi.status();
            // Cache active users list in state
            state.activeUsers = status.data?.usuarios_ativos || [];
            
            if (userName) {
                userName.textContent = status.data?.usuario_logado?.nome || status.data?.usuario_logado?.username || "Operador";
            }
            document.getElementById("terminalVersion").textContent = `v${status.data?.versao || "1.0.0"}`;
            document.getElementById("terminalConnection").textContent = status.data?.scanner_ativo ? "ONLINE" : "OFFLINE";
        } catch (error) {
            console.error("Terminal bootstrap failed:", error);
            if (error.status === 401 || error.status === 403) {
                window.location.href = "/login";
                return;
            }
        }

        await startScanner();
    }

    document.addEventListener("DOMContentLoaded", bootstrap);
})();
