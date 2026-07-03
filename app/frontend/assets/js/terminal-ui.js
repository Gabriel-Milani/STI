const TerminalUI = (() => {
    function setState(message, detail, icon = "📷") {
        const state = document.getElementById("terminalState");
        if (!state) return;
        state.innerHTML = `<div class="terminal-icon">${icon}</div><h1>${message}</h1><p>${detail}</p>`;
    }

    function showCard(content) {
        const card = document.getElementById("terminalCard");
        if (!card) return;
        card.innerHTML = content;
        card.classList.remove("hidden");
    }

    function hideCard() {
        const card = document.getElementById("terminalCard");
        if (!card) return;
        card.classList.add("hidden");
    }

    function showToast(message, type = "success") {
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
        }, 2200);
    }

    function showLoader(message = "Processando...") {
        setState("Processando", message, "⏳");
    }

    return { setState, showCard, hideCard, showToast, showLoader };
})();
