(function () {
    const SELECTORS = {
        scanner: "scannerViewport",
        state: "terminalState",
        card: "terminalCard",
        userName: "terminalUserName",
        time: "terminalTime",
        connection: "terminalConnection",
        version: "terminalVersion",
        manualForm: "manualCodeForm",
        manualInput: "manualCodeInput",
    };

    const ACTIONS = {
        entrada: {
            title: "Entrada no estoque",
            state: "Adicionar unidades",
            submit: "Registrar entrada",
            requiresUser: false,
            quantityMode: "open",
            tone: "success",
        },
        retirar: {
            title: "Retirada",
            state: "Registrar retirada",
            submit: "Confirmar retirada",
            userLabel: "Entregue para",
            quantityMode: "stock",
            tone: "danger",
        },
        emprestar: {
            title: "Empréstimo",
            state: "Registrar empréstimo",
            submit: "Confirmar empréstimo",
            userLabel: "Emprestado para",
            quantityMode: "stock",
            hasReturnDate: true,
            tone: "primary",
        },
    };

    const MOVEMENT_LABELS = {
        entrada: "Entrada",
        retirada: "Retirada",
        emprestimo: "Empréstimo",
        devolucao: "Devolução",
        descarte: "Descarte",
        mover: "Movido",
    };

    const state = {
        currentItem: null,
        activeUsers: [],
        pendingAction: null,
        selectedUser: "",
        waitingForLocationScan: false,
        waitingForUserScan: false,
        targetLocation: null,
        isSubmitting: false,
        scannerStarting: false,
    };

    const dom = {
        byId(id) {
            return document.getElementById(id);
        },
        setText(id, value) {
            const element = this.byId(id);
            if (element) element.textContent = value;
        },
    };

    async function ignoreAsyncError(result) {
        try {
            if (result && typeof result.then === "function") {
                await result;
            }
        } catch (_error) {}
    }

    function read(obj, path, fallback = undefined) {
        let value = obj;
        for (const key of path) {
            if (value == null) return fallback;
            value = value[key];
        }
        return value == null ? fallback : value;
    }

    const ui = {
        setState(title, detail, icon = "📷", tone = "default") {
            const element = dom.byId(SELECTORS.state);
            if (!element) return;
            element.dataset.tone = tone;
            document.body.dataset.tone = tone;
            element.innerHTML = `<div class="terminal-icon">${icon}</div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(detail)}</p>`;
        },
        showCard(content, tone = "default") {
            const card = dom.byId(SELECTORS.card);
            if (!card) return;
            card.dataset.tone = tone;
            card.innerHTML = content;
            card.classList.remove("hidden");
            requestAnimationFrame(() => card.classList.add("show"));
        },
        hideCard() {
            const card = dom.byId(SELECTORS.card);
            if (!card) return;
            card.classList.remove("show");
            card.classList.add("hidden");
            card.innerHTML = "";
        },
        loader(message = "Processando...") {
            this.setState("Processando", message, "⏳", "loading");
        },
        toast(message, type = "success") {
            const existing = document.querySelector(".terminal-toast");
            if (existing) existing.remove();
            const toast = document.createElement("div");
            toast.className = `terminal-toast ${type}`;
            toast.textContent = message;
            document.body.appendChild(toast);
            requestAnimationFrame(() => toast.classList.add("show"));
            setTimeout(() => {
                toast.classList.remove("show");
                setTimeout(() => toast.remove(), 220);
            }, 2400);
        },
        feedback(message, type = "error") {
            const element = document.querySelector("[data-terminal-feedback]");
            if (!element) return;
            element.className = `terminal-feedback ${type}`;
            element.textContent = message;
            element.hidden = false;
        },
    };

    const api = {
        async request(path, options = {}) {
            const init = {
                credentials: "same-origin",
                headers: {},
                ...options,
            };
            if (init.body && !(init.body instanceof FormData)) {
                init.headers["Content-Type"] = init.headers["Content-Type"] || "application/json";
            }

            const response = await fetch(path, init);
            let payload;
            try {
                payload = await response.json();
            } catch (_error) {
                payload = { ok: false, error: "Resposta inválida do servidor." };
            }
            if (!response.ok || !payload.ok) {
                const error = new Error(payload.error || "Operação não concluída.");
                error.status = response.status;
                throw error;
            }
            return payload;
        },
        status() {
            return this.request("/api/terminal/status");
        },
        scan(code) {
            return this.request(`/api/terminal/scan/${encodeURIComponent(code)}`);
        },
        action(payload) {
            return this.request("/api/terminal/action", { method: "POST", body: JSON.stringify(payload) });
        },
    };

    const scanner = {
        instance: null,
        active: false,
        scanSize() {
            const viewport = dom.byId(SELECTORS.scanner);
            const rect = viewport ? viewport.getBoundingClientRect() : null;
            const base = rect ? Math.min(rect.width, rect.height) : Math.min(window.innerWidth, window.innerHeight);
            const size = Math.max(220, Math.min(420, Math.floor(base)));
            document.documentElement.style.setProperty("--scan-size", `${size}px`);
            return size;
        },
        async startWithConfig(cameraConfig, onDecode) {
            const size = this.scanSize();
            await this.instance.start(
                cameraConfig,
                {
                    fps: 10,
                    qrbox: { width: size, height: size },
                    aspectRatio: 1,
                    disableFlip: false,
                },
                async (decodedText) => {
                    await this.stop();
                    onDecode(decodedText);
                },
                () => {}
            );
        },
        async start(onDecode) {
            if (state.scannerStarting || this.active) return;
            if (!dom.byId(SELECTORS.scanner)) return;
            if (!window.Html5Qrcode) throw new Error("Biblioteca de scanner indisponível.");

            state.scannerStarting = true;
            try {
                await this.resetInstance();
                try {
                    await this.startWithConfig({
                        facingMode: "environment",
                    }, onDecode);
                } catch (_error) {
                    await this.resetInstance();
                    let cameras = [];
                    try {
                        if (typeof window.Html5Qrcode.getCameras === "function") {
                            const cameraResult = window.Html5Qrcode.getCameras();
                            cameras = cameraResult && typeof cameraResult.then === "function" ? await cameraResult : [];
                        }
                    } catch (_cameraError) {
                        cameras = [];
                    }
                    const fallbackCamera = cameras.length ? cameras[cameras.length - 1] : null;
                    const fallback = fallbackCamera ? fallbackCamera.id : "";
                    if (!fallback) {
                        await this.startWithConfig({ facingMode: "environment" }, onDecode);
                    } else {
                        await this.startWithConfig(fallback, onDecode);
                    }
                }
                this.active = true;
            } finally {
                state.scannerStarting = false;
            }
        },
        async resetInstance() {
            if (this.instance) {
                await this.stop();
                if (typeof this.instance.clear === "function") {
                    await ignoreAsyncError(this.instance.clear());
                }
            }
            const viewport = dom.byId(SELECTORS.scanner);
            if (viewport) viewport.innerHTML = "";
            this.instance = new window.Html5Qrcode(SELECTORS.scanner);
        },
        async stop() {
            if (!this.instance || !this.active) return;
            this.active = false;
            await ignoreAsyncError(this.instance.stop());
            if (typeof this.instance.clear === "function") {
                await ignoreAsyncError(this.instance.clear());
            }
        },
    };

    function escapeHtml(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function playSound(type) {
        const audio = dom.byId(`sound${type.charAt(0).toUpperCase()}${type.slice(1)}`);
        if (!audio) return;
        audio.currentTime = 0;
        ignoreAsyncError(audio.play());
    }

    function vibrate(pattern = [18]) {
        if (navigator.vibrate) navigator.vibrate(pattern);
    }

    function runOptionalAsync(fn) {
        if (typeof fn !== "function") return;
        try {
            ignoreAsyncError(fn());
        } catch (_error) {}
    }

    function updateClock() {
        const formatter = new Intl.DateTimeFormat("pt-BR", {
            timeZone: "America/Sao_Paulo",
            hour: "2-digit",
            minute: "2-digit",
        });
        dom.setText(SELECTORS.time, formatter.format(new Date()));
    }

    function initTabletMode() {
        document.addEventListener("click", () => {
            runOptionalAsync(() => {
                if (document.documentElement.requestFullscreen) return document.documentElement.requestFullscreen();
            });
            runOptionalAsync(() => {
                if (window.screen && screen.orientation && screen.orientation.lock) {
                    return screen.orientation.lock("portrait");
                }
            });
        }, { once: true });
    }

    async function startScanner() {
        try {
            await scanner.start(handleScan);
        } catch (error) {
            ui.toast(error.message || "Não foi possível iniciar a câmera", "error");
            ui.setState("Câmera indisponível", "Verifique a permissão da câmera e tente novamente.", "📷", "error");
            playSound("error");
            vibrate([80, 30, 80]);
        }
    }

    async function handleScan(code) {
        code = String(code || "").trim();
        if (!code) return;
        playSound("scan");
        if (state.waitingForLocationScan) {
            await handleLocationScan(code);
            return;
        }
        if (state.waitingForUserScan) {
            await handleUserScan(code);
            return;
        }
        await handleLookupScan(code);
    }

    async function handleLookupScan(code) {
        ui.loader("Lendo QR...");
        try {
            const response = await api.scan(code);
            state.currentItem = response.data;
            state.selectedUser = "";
            playSound("success");
            vibrate([18, 10, 18]);

            const tipo = read(response, ["data", "tipo"], "");
            if (tipo === "produto") renderProductCard(response.data.produto);
            else if (tipo === "localizacao") renderLocationCard(response.data.localizacao);
            else if (tipo === "usuario") renderUserCard(response.data.usuario);
            else throw new Error("Tipo de item não identificado.");
        } catch (error) {
            playSound("error");
            vibrate([70, 25, 70]);
            ui.toast(error.message || "Falha ao localizar item", "error");
            ui.setState("Leitura não identificada", "Tente novamente ou verifique o código.", "⚠️", "error");
            setTimeout(resetTerminal, 1800);
        }
    }

    async function handleUserScan(code) {
        ui.loader("Validando usuário...");
        try {
            const response = await api.scan(code);
            if (read(response, ["data", "tipo"], "") !== "usuario") {
                throw new Error("Escaneie o QR de um usuário ativo.");
            }
            const user = response.data.usuario;
            state.selectedUser = user.nome || user.username || "";
            state.waitingForUserScan = false;
            playSound("success");
            renderActionForm(state.pendingAction);
            ui.feedback(`Usuário selecionado: ${state.selectedUser}`, "success");
        } catch (error) {
            state.waitingForUserScan = false;
            playSound("error");
            renderActionForm(state.pendingAction);
            ui.feedback(error.message || "Usuário inválido.", "error");
        }
    }

    async function handleLocationScan(code) {
        ui.loader("Validando localização...");
        try {
            const response = await api.scan(code);
            if (read(response, ["data", "tipo"], "") !== "localizacao") {
                throw new Error("Escaneie o QR de uma localização.");
            }
            state.targetLocation = response.data.localizacao;
            state.waitingForLocationScan = false;
            playSound("success");
            renderMoveConfirmation();
        } catch (error) {
            state.waitingForLocationScan = false;
            playSound("error");
            renderMoveScanPrompt();
            ui.feedback(error.message || "Localização inválida.", "error");
        }
    }

    function resetTerminal() {
        state.currentItem = null;
        state.pendingAction = null;
        state.selectedUser = "";
        state.waitingForLocationScan = false;
        state.waitingForUserScan = false;
        state.targetLocation = null;
        ui.hideCard();
        ui.setState("Aguardando leitura", "Posicione o QR do produto ou da localização.", "📷");
        startScanner();
    }

    function productStatus(product) {
        const quantity = Number(read(product, ["quantidade_atual"], 0) || 0);
        const minimum = Number(read(product, ["estoque_minimo"], 0) || 0);
        if (read(product, ["emprestimo_ativo"], null)) return { label: "Emprestado", tone: "warning", detail: "Há empréstimo aberto" };
        if (quantity <= 0) return { label: "Sem estoque", tone: "danger", detail: "Entrada necessária" };
        if (minimum > 0 && quantity <= minimum) return { label: "Estoque baixo", tone: "warning", detail: `Mínimo: ${minimum}` };
        return { label: "Disponível", tone: "success", detail: "Pronto para movimentar" };
    }

    function renderProductCard(product) {
        if (!product) {
            resetTerminal();
            return;
        }

        const status = productStatus(product);
        const quantity = Number(product.quantidade_atual || 0);
        const activeLoan = product.emprestimo_ativo;
        const unavailable = quantity <= 0;
        const loanInfo = activeLoan ? `
            <div class="terminal-alert">
                <strong>Item emprestado</strong>
                <span>${escapeHtml(activeLoan.emprestado_para || "Responsável não informado")}</span>
            </div>
        ` : "";

        const actions = activeLoan ? `
            <button class="btn btn-success btn-wide" data-action="devolver">Devolver empréstimo</button>
            <button class="btn btn-secondary" data-action="consultar">Consultar</button>
            <button class="btn btn-ghost" data-action="cancelar">Ler outro código</button>
        ` : `
            <button class="btn btn-success btn-wide" data-action="entrada">Entrada</button>
            <button class="btn btn-danger" data-action="retirar" ${unavailable ? "disabled" : ""}>Retirar</button>
            <button class="btn btn-primary" data-action="emprestar" ${unavailable ? "disabled" : ""}>Emprestar</button>
            <button class="btn btn-secondary" data-action="mover">Mover</button>
            <button class="btn btn-secondary" data-action="consultar">Consultar</button>
            <button class="btn btn-ghost" data-action="cancelar">Ler outro código</button>
        `;

        ui.showCard(`
            <div class="terminal-product">
                <div class="terminal-product-main">
                    <span class="label">Produto</span>
                    <h2>${escapeHtml(product.nome || "Sem nome")}</h2>
                    <div class="terminal-product-code">${escapeHtml(product.codigo || "-")} · ${escapeHtml(product.modelo || "-")}</div>
                </div>
                <div class="terminal-stock ${status.tone}">
                    <strong>${quantity}</strong>
                    <span>unid.</span>
                </div>
            </div>
            <div class="terminal-status-row">
                <span class="status-pill ${status.tone}">${escapeHtml(status.label)}</span>
                <span>${escapeHtml(status.detail)}</span>
            </div>
            <div class="terminal-location">
                <span>Localização atual</span>
                <strong>${escapeHtml(product.localizacao_label || "-")}</strong>
            </div>
            ${loanInfo}
            <div class="terminal-feedback" data-terminal-feedback hidden></div>
            <div class="terminal-actions action-grid">${actions}</div>
        `, status.tone);
        ui.setState("Produto encontrado", "Confira estoque e escolha a ação.", "✅", status.tone);
    }

    function renderLocationCard(location) {
        ui.showCard(`
            <div class="terminal-card-header">
                <span class="label">Localização</span>
                <h2>${escapeHtml(read(location, ["nome"], "Localização") || "Localização")}</h2>
            </div>
            <div class="terminal-location large">
                <span>Código</span>
                <strong>${escapeHtml(read(location, ["codigo"], "-") || "-")}</strong>
            </div>
            <div class="terminal-location">
                <span>Posição</span>
                <strong>${escapeHtml(read(location, ["label"], "-") || "-")}</strong>
            </div>
            <div class="terminal-actions">
                <button class="btn btn-primary btn-wide" data-action="cancelar">Ler outro código</button>
            </div>
        `, "info");
        ui.setState("Localização detectada", "Use este QR ao mover um produto.", "📍", "success");
    }

    function renderUserCard(user) {
        ui.showCard(`
            <div class="terminal-card-header">
                <span class="label">Usuário</span>
                <h2>${escapeHtml(read(user, ["nome"], "") || read(user, ["username"], "") || "Usuário")}</h2>
            </div>
            <div class="terminal-location">
                <span>Login</span>
                <strong>${escapeHtml(read(user, ["username"], "-") || "-")}</strong>
            </div>
            <div class="terminal-location">
                <span>Perfil</span>
                <strong>${escapeHtml(read(user, ["perfil"], "-") || "-")}</strong>
            </div>
            <div class="terminal-actions">
                <button class="btn btn-primary btn-wide" data-action="cancelar">Ler outro código</button>
            </div>
        `, "info");
        ui.setState("Usuário identificado", "Use o QR dentro de uma retirada ou empréstimo.", "👤", "success");
    }

    function renderActionForm(action) {
        const product = read(state, ["currentItem", "produto"], null);
        const config = ACTIONS[action];
        if (!product || !config) return;
        state.pendingAction = action;

        const max = config.quantityMode === "stock" ? Math.max(1, Number(product.quantidade_atual || 1)) : 9999;
        const userField = config.requiresUser === false ? "" : renderUserField(config);
        const dateField = config.hasReturnDate ? `
            <label class="terminal-field">
                <span>Data prevista</span>
                <input id="terminalActionDate" type="date">
            </label>
        ` : "";

        ui.showCard(`
            <div class="terminal-card-header split">
                <div>
                    <span class="label">${escapeHtml(config.title)}</span>
                    <h2>${escapeHtml(product.nome || "Produto")}</h2>
                </div>
                <span class="status-pill ${config.tone}">${product.quantidade_atual == null ? 0 : product.quantidade_atual} unid.</span>
            </div>
            <div class="terminal-form">
                ${renderQuantityControl(max)}
                ${userField}
                ${dateField}
                <details class="terminal-optional">
                    <summary>Adicionar observação</summary>
                    <label class="terminal-field">
                        <span>Observação</span>
                        <textarea id="terminalActionNote" rows="3" placeholder="Opcional"></textarea>
                    </label>
                </details>
            </div>
            <div class="terminal-feedback" data-terminal-feedback hidden></div>
            <div class="terminal-actions">
                <button class="btn btn-${config.tone} btn-wide" data-action="submit:${action}">${escapeHtml(config.submit)}</button>
                <button class="btn btn-ghost" data-action="voltar-produto">Voltar ao produto</button>
            </div>
        `, "prompt");
        ui.setState(config.state, "Ajuste quantidade e confirme.", "⚙️", "loading");
    }

    function renderUserField(config) {
        if (state.selectedUser) {
            return `
                <div class="terminal-selected-user">
                    <span>${escapeHtml(config.userLabel || "Usuário")}</span>
                    <strong>${escapeHtml(state.selectedUser)}</strong>
                    <input id="terminalActionUser" type="hidden" value="${escapeHtml(state.selectedUser)}">
                    <button type="button" class="btn btn-secondary" data-action="scan-user">Trocar por QR</button>
                </div>
            `;
        }

        return `
            <label class="terminal-field">
                <span>${escapeHtml(config.userLabel || "Usuário")}</span>
                <div class="terminal-user-entry">
                    ${renderUserInput()}
                    <button type="button" class="btn btn-secondary" data-action="scan-user">QR usuário</button>
                </div>
            </label>
        `;
    }

    function renderUserInput() {
        if (!state.activeUsers.length) {
            return `<input id="terminalActionUser" type="text" placeholder="Nome do usuário">`;
        }
        const options = state.activeUsers
            .map((user) => {
                const label = user.nome || user.username;
                return `<option value="${escapeHtml(label)}">${escapeHtml(label)}</option>`;
            })
            .join("");
        return `<select id="terminalActionUser"><option value="">Selecione...</option>${options}</select>`;
    }

    function renderQuantityControl(max) {
        return `
            <div class="terminal-qty" data-max="${max}">
                <span>Quantidade</span>
                <div class="terminal-qty-control">
                    <button type="button" class="btn btn-secondary" data-qty="-1">-1</button>
                    <input id="terminalActionQty" type="number" min="1" max="${max}" value="1" inputmode="numeric">
                    <button type="button" class="btn btn-secondary" data-qty="1">+1</button>
                    <button type="button" class="btn btn-secondary" data-qty="5">+5</button>
                    <button type="button" class="btn btn-secondary" data-qty="10">+10</button>
                </div>
            </div>
        `;
    }

    function normalizeQuantity() {
        const wrapper = document.querySelector(".terminal-qty");
        const input = dom.byId("terminalActionQty");
        if (!wrapper || !input) return 1;
        const max = Number(wrapper.dataset.max || 9999);
        const value = Math.min(max, Math.max(1, Number(input.value || 1)));
        input.value = String(value);
        return value;
    }

    function changeQuantity(delta) {
        const input = dom.byId("terminalActionQty");
        if (!input) return;
        input.value = String(Number(input.value || 1) + delta);
        normalizeQuantity();
    }

    function startUserScan() {
        if (!state.pendingAction) return;
        state.waitingForUserScan = true;
        ui.showCard(`
            <div class="scan-guidance">
                <span class="label">Selecionar usuário</span>
                <h2>Escaneie o QR do usuário</h2>
                <p>${escapeHtml(read(ACTIONS, [state.pendingAction, "title"], "Operação") || "Operação")} · ${escapeHtml(read(state, ["currentItem", "produto", "nome"], "Produto") || "Produto")}</p>
            </div>
            <div class="terminal-feedback" data-terminal-feedback hidden></div>
            <div class="terminal-actions">
                <button class="btn btn-danger btn-wide" data-action="cancel-user-scan">Voltar ao formulário</button>
            </div>
        `, "prompt");
        ui.setState("Aguardando usuário", "Aponte a câmera para o QR do usuário.", "👤", "loading");
        startScanner();
    }

    async function submitMovement(action) {
        if (state.isSubmitting) return;
        const product = read(state, ["currentItem", "produto"], null);
        const config = ACTIONS[action];
        if (!product || !config) return;

        const userInput = dom.byId("terminalActionUser");
        const usuario = userInput && userInput.value ? userInput.value.trim() : "";
        if (config.requiresUser !== false && !usuario) {
            ui.feedback("Informe ou escaneie o usuário responsável.", "error");
            playSound("error");
            return;
        }

        state.isSubmitting = true;
        document.body.classList.add("is-submitting");
        ui.loader("Registrando operação...");
        try {
            const response = await api.action({
                action,
                codigo: product.codigo,
                quantidade: normalizeQuantity(),
                usuario,
                data_prevista: dom.byId("terminalActionDate") ? dom.byId("terminalActionDate").value : "",
                observacao: dom.byId("terminalActionNote") && dom.byId("terminalActionNote").value ? dom.byId("terminalActionNote").value.trim() : "",
            });
            completeAction(read(response, ["data", "mensagem"], "Operação registrada.") || "Operação registrada.");
        } catch (error) {
            renderActionForm(action);
            failAction(error.message || "Falha ao registrar operação.");
        } finally {
            state.isSubmitting = false;
            document.body.classList.remove("is-submitting");
        }
    }

    async function submitSimpleAction(action, payload = {}) {
        if (state.isSubmitting) return;
        const product = read(state, ["currentItem", "produto"], null);
        if (!product) return;

        state.isSubmitting = true;
        document.body.classList.add("is-submitting");
        ui.loader("Registrando operação...");
        try {
            const response = await api.action({ action, codigo: product.codigo, ...payload });
            completeAction(read(response, ["data", "mensagem"], "Operação registrada.") || "Operação registrada.");
        } catch (error) {
            renderProductCard(product);
            failAction(error.message || "Falha ao registrar operação.");
        } finally {
            state.isSubmitting = false;
            document.body.classList.remove("is-submitting");
        }
    }

    function startMoveFlow() {
        state.waitingForLocationScan = true;
        state.targetLocation = null;
        renderMoveScanPrompt();
        startScanner();
    }

    function renderMoveScanPrompt() {
        const product = read(state, ["currentItem", "produto"], null);
        if (!product) return;
        state.waitingForLocationScan = true;
        ui.showCard(`
            <div class="scan-guidance">
                <span class="label">Mover produto</span>
                <h2>${escapeHtml(product.nome || "Produto")}</h2>
                <div class="terminal-location">
                    <span>Origem</span>
                    <strong>${escapeHtml(product.localizacao_label || "-")}</strong>
                </div>
                <p>Escaneie agora o QR da nova localização.</p>
            </div>
            <div class="terminal-feedback" data-terminal-feedback hidden></div>
            <div class="terminal-actions">
                <button class="btn btn-danger btn-wide" data-action="cancel-move">Voltar ao produto</button>
            </div>
        `, "prompt");
        ui.setState("Aguardando localização", "Aponte para o QR da nova prateleira.", "📍", "loading");
    }

    function renderMoveConfirmation() {
        const product = read(state, ["currentItem", "produto"], null);
        const location = state.targetLocation;
        if (!product || !location) return;

        ui.showCard(`
            <div class="terminal-card-header">
                <span class="label">Confirmar mudança</span>
                <h2>${escapeHtml(product.nome || "Produto")}</h2>
            </div>
            <div class="move-route">
                <div>
                    <span>Origem</span>
                    <strong>${escapeHtml(product.localizacao_label || "-")}</strong>
                </div>
                <div>
                    <span>Destino</span>
                    <strong>${escapeHtml(location.label || location.nome || "-")}</strong>
                </div>
            </div>
            <details class="terminal-optional">
                <summary>Adicionar observação</summary>
                <label class="terminal-field">
                    <span>Observação</span>
                    <textarea id="terminalMoveNote" rows="3" placeholder="Opcional"></textarea>
                </label>
            </details>
            <div class="terminal-feedback" data-terminal-feedback hidden></div>
            <div class="terminal-actions">
                <button class="btn btn-success btn-wide" data-action="confirmar-mover">Confirmar mudança</button>
                <button class="btn btn-ghost" data-action="voltar-produto">Voltar ao produto</button>
            </div>
        `, "prompt");
        ui.setState("Confirmar mudança", "Confira origem e destino.", "⚙️", "loading");
    }

    async function submitMove() {
        const location = state.targetLocation;
        if (!location) return;
        const moveNote = dom.byId("terminalMoveNote");
        await submitSimpleAction("mover", {
            destino: location.codigo || location.nome,
            observacao: moveNote && moveNote.value ? moveNote.value.trim() : "",
        });
    }

    async function renderConsultation() {
        const product = read(state, ["currentItem", "produto"], null);
        if (!product) return;

        ui.loader("Consultando histórico...");
        try {
            const response = await api.action({ action: "consultar", codigo: product.codigo });
            const detail = read(response, ["data", "produto"], null) || product;
            const history = read(response, ["data", "historico"], []) || [];
            ui.showCard(`
                <div class="terminal-card-header split">
                    <div>
                        <span class="label">Consulta</span>
                        <h2>${escapeHtml(detail.nome || "Produto")}</h2>
                    </div>
                    <span class="status-pill success">${detail.quantidade_atual == null ? 0 : detail.quantidade_atual} unid.</span>
                </div>
                <div class="terminal-location">
                    <span>Localização</span>
                    <strong>${escapeHtml(detail.localizacao_label || "-")}</strong>
                </div>
                <div class="terminal-history">${renderHistory(history)}</div>
                <div class="terminal-actions">
                    <button class="btn btn-primary btn-wide" data-action="voltar-produto">Voltar ao produto</button>
                </div>
            `, "info");
            ui.setState("Ficha do produto", "Últimas movimentações do item.", "🔎", "success");
            playSound("success");
        } catch (error) {
            renderProductCard(product);
            failAction(error.message || "Falha ao consultar produto.");
        }
    }

    function renderHistory(history) {
        if (!history.length) return `<div class="terminal-empty">Sem movimentações recentes.</div>`;
        return history.map((item) => {
            const date = item.data_hora
                ? new Date(`${item.data_hora}Z`).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
                : "-";
            const signal = item.tipo === "entrada" || item.tipo === "devolucao" ? "+" : item.tipo === "mover" ? "" : "-";
            const responsible = item.responsavel_destino || item.responsavel_origem || item.destino || "";
            const location = item.tipo === "mover"
                ? item.localizacao_destino_label
                : item.localizacao_origem_label || item.localizacao_destino_label;
            return `
                <div class="terminal-history-row">
                    <div>
                        <strong>${escapeHtml(MOVEMENT_LABELS[item.tipo] || item.tipo)}</strong>
                        <span>${escapeHtml(date)}${responsible ? ` · ${escapeHtml(responsible)}` : ""}</span>
                        ${location ? `<small>${escapeHtml(location)}</small>` : ""}
                    </div>
                    <b>${signal}${item.tipo === "mover" ? "-" : item.quantidade}</b>
                </div>
            `;
        }).join("");
    }

    function completeAction(message) {
        playSound("success");
        vibrate([18, 10, 18]);
        ui.toast(message, "success");
        state.selectedUser = "";
        ui.hideCard();
        ui.setState("Operação realizada", "Retornando para a câmera.", "✅", "success");
        setTimeout(resetTerminal, 1600);
    }

    function failAction(message) {
        playSound("error");
        vibrate([80, 25, 80]);
        ui.toast(message, "error");
        ui.feedback(message, "error");
        ui.setState("Erro na operação", "Confira os dados e tente novamente.", "⚠️", "error");
    }

    function handleActionClick(event) {
        const button = event.target.closest("[data-action]");
        if (!button || button.disabled) return;
        const action = button.dataset.action;

        if (action === "cancelar") resetTerminal();
        else if (action === "voltar-produto") renderProductCard(read(state, ["currentItem", "produto"], null));
        else if (action === "mover") startMoveFlow();
        else if (action === "cancel-move") renderProductCard(read(state, ["currentItem", "produto"], null));
        else if (action === "scan-user") startUserScan();
        else if (action === "cancel-user-scan") renderActionForm(state.pendingAction);
        else if (action === "confirmar-mover") submitMove();
        else if (action === "devolver") submitSimpleAction("devolver");
        else if (action === "consultar") renderConsultation();
        else if (action && action.startsWith("submit:")) submitMovement(action.split(":")[1]);
        else if (ACTIONS[action]) renderActionForm(action);
    }

    async function bootstrap() {
        updateClock();
        setInterval(updateClock, 1000);
        initTabletMode();
        document.addEventListener("click", handleActionClick);
        document.addEventListener("click", (event) => {
            const qtyButton = event.target.closest("[data-qty]");
            if (qtyButton) changeQuantity(Number(qtyButton.dataset.qty));
        });
        document.addEventListener("change", (event) => {
            if (event.target && event.target.id === "terminalActionQty") normalizeQuantity();
        });
        const manualForm = dom.byId(SELECTORS.manualForm);
        if (manualForm) manualForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const input = dom.byId(SELECTORS.manualInput);
            const code = input && input.value ? input.value.trim() : "";
            if (!code) return;
            if (input) input.value = "";
            await handleScan(code);
        });

        if (window.isSecureContext === false) {
            ui.toast("A câmera exige HTTPS ou localhost.", "error");
            ui.setState("Câmera bloqueada", "Abra o terminal em HTTPS ou localhost para liberar a câmera.", "🔒", "error");
        }

        try {
            const status = await api.status();
            state.activeUsers = read(status, ["data", "usuarios_ativos"], []) || [];
            dom.setText(SELECTORS.userName, read(status, ["data", "usuario_logado", "nome"], "") || read(status, ["data", "usuario_logado", "username"], "") || "Operador");
            dom.setText(SELECTORS.version, `v${read(status, ["data", "versao"], "1.0.0") || "1.0.0"}`);
            const scannerActive = Boolean(read(status, ["data", "scanner_ativo"], false));
            dom.setText(SELECTORS.connection, scannerActive ? "ONLINE" : "OFFLINE");
            const connection = dom.byId(SELECTORS.connection);
            if (connection) connection.classList.toggle("is-offline", !scannerActive);
        } catch (error) {
            if (error.status === 401 || error.status === 403) {
                window.location.href = "/login";
                return;
            }
            ui.toast(error.message || "Falha ao carregar terminal.", "error");
            dom.setText(SELECTORS.connection, "OFFLINE");
            const connection = dom.byId(SELECTORS.connection);
            if (connection) connection.classList.add("is-offline");
        }

        if (window.isSecureContext !== false) startScanner();
    }

    document.addEventListener("DOMContentLoaded", bootstrap);
})();
