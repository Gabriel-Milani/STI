mountNav("emprestimos");

const modal = new bootstrap.Modal(byId("returnModal"));

async function loadLoans() {
    const status = byId("statusFilter").value;
    const { data } = await Api.get(`/api/emprestimos?status=${encodeURIComponent(status)}`);
    byId("loanRows").innerHTML = data.emprestimos.map((loan) => `
        <tr>
            <td><a href="/produtos/${encodeURIComponent(loan.produto_codigo)}">${escapeHtml(loan.produto_nome)}</a><div class="small text-secondary">${escapeHtml(loan.produto_codigo)}</div></td>
            <td>${escapeHtml(loan.emprestado_para)}</td>
            <td>${escapeHtml(loan.destino || "-")}</td>
            <td>${formatDate(loan.data_emprestimo)}</td>
            <td class="text-end">${loan.quantidade}</td>
            <td class="text-end">${loan.status === "aberto" ? `<button class="btn btn-sm btn-outline-primary" data-return="${loan.id}">Devolver</button>` : `<span class="badge bg-secondary">Devolvido</span>`}</td>
        </tr>
    `).join("") || `<tr><td colspan="6" class="text-secondary">Nenhum empréstimo encontrado.</td></tr>`;
}

(async function init() {
    await requireAuth();
    await loadLoans();
    byId("statusFilter").addEventListener("change", loadLoans);
    byId("loanRows").addEventListener("click", (event) => {
        const id = event.target.dataset.return;
        if (!id) return;
        byId("returnId").value = id;
        modal.show();
    });
    byId("returnForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        const data = formDataObject(event.currentTarget);
        try {
            const { message } = await Api.post(`/api/emprestimos/${data.id}/devolver`, data);
            modal.hide();
            setAlert(message || "Devolução registrada.");
            await loadLoans();
        } catch (error) {
            setAlert(error.message, "danger");
        }
    });
})();
