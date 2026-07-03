const TerminalScanner = (() => {
    let html5QrCode = null;
    let active = false;
    let onScan = null;

    async function start({ targetId, onDecode }) {
        if (active) return;
        onScan = onDecode;
        const container = document.getElementById(targetId);
        if (!container) return;

        const { Html5Qrcode } = window;
        if (!Html5Qrcode) {
            throw new Error("Biblioteca de scanner indisponível.");
        }

        html5QrCode = new Html5Qrcode(targetId, { fps: 10, qrbox: { width: 260, height: 260 } });
        await html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 260, height: 260 } }, (decodedText) => {
            if (!active) return;
            active = false;
            html5QrCode.stop().catch(() => {});
            onScan?.(decodedText);
        }, () => {});
        active = true;
    }

    async function stop() {
        if (!html5QrCode || !active) return;
        await html5QrCode.stop().catch(() => {});
        active = false;
    }

    function isActive() {
        return active;
    }

    return { start, stop, isActive };
})();
