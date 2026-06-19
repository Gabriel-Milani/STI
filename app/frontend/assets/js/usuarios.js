mountNav("usuarios");

let users = [];
let userModal = null;
let passwordModal = null;

function isActiveValue(value) {
    return value === 1 || value === true || value === "1";
}

function statusLabel(user) {
    return isActiveValue(user.ativo)
        ? `<span class="badge bg-success">Ativo</span>`
        : `<span class="badge bg-secondary">Inativo</span>`;
}

function renderUsers() {
    byId("userRows").innerHTML = users.map((user) => `
        <tr>
            <td>${escapeHtml(user.nome)}</td>
            <td>${escapeHtml(user.usuario)}</td>
            <td>${statusLabel(user)}</td>
            <td>${formatDate(user.ultimo_login)}</td>
            <td class="text-end">
                <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-primary" type="button" data-edit="${user.id}">Editar</button>
                    <button class="btn btn-outline-secondary" type="button" data-reset="${user.id}">Resetar senha</button>
                    ${isActiveValue(user.ativo)
                        ? `<button class="btn btn-outline-danger" type="button" data-disable="${user.id}">Desativar</button>`
                        : `<button class="btn btn-outline-success" type="button" data-enable="${user.id}">Ativar</button>`}
                </div>
            </td>
        </tr>
    `).join("") || `<tr><td colspan="5" class="text-secondary">Nenhum usuário encontrado.</td></tr>`;
}

async function loadUsers() {
    const { data } = await Api.get("/api/usuarios");
    users = data.usuarios;
    renderUsers();
}

function openNewUser() {
    const form = byId("userForm");
    form.reset();
    byId("userId").value = "";
    byId("userModalTitle").textContent = "Novo usuário";
    byId("passwordFields").classList.remove("d-none");
    byId("userActive").checked = true;
    userModal.show();
}

function openEditUser(id) {
    const user = users.find((item) => String(item.id) === String(id));
    if (!user) return;
    const form = byId("userForm");
    form.reset();
    byId("userId").value = user.id;
    form.elements.nome.value = user.nome || "";
    form.elements.usuario.value = user.usuario || "";
    byId("userActive").checked = isActiveValue(user.ativo);
    byId("userModalTitle").textContent = "Editar usuário";
    byId("passwordFields").classList.add("d-none");
    userModal.show();
}

function openPasswordReset(id) {
    byId("passwordForm").reset();
    byId("passwordUserId").value = id;
    passwordModal.show();
}

function userPayload(form) {
    const data = formDataObject(form);
    return {
        nome: data.nome,
        usuario: data.usuario,
        senha: data.senha,
        confirmar_senha: data.confirmar_senha,
        ativo: byId("userActive").checked,
    };
}

(async function init() {
    await requireAuth();
    userModal = new bootstrap.Modal(byId("userModal"));
    passwordModal = new bootstrap.Modal(byId("passwordModal"));
    await loadUsers();

    byId("newUserButton").addEventListener("click", openNewUser);

    byId("userRows").addEventListener("click", async (event) => {
        const edit = event.target.closest("[data-edit]");
        const reset = event.target.closest("[data-reset]");
        const disable = event.target.closest("[data-disable]");
        const enable = event.target.closest("[data-enable]");
        try {
            if (edit) {
                openEditUser(edit.dataset.edit);
            } else if (reset) {
                openPasswordReset(reset.dataset.reset);
            } else if (disable) {
                const { message } = await Api.post(`/api/usuarios/${disable.dataset.disable}/desativar`, {});
                await loadUsers();
                setAlert(message || "Usuário desativado com sucesso.");
            } else if (enable) {
                const { message } = await Api.post(`/api/usuarios/${enable.dataset.enable}/ativar`, {});
                await loadUsers();
                setAlert(message || "Usuário ativado com sucesso.");
            }
        } catch (error) {
            setAlert(error.message, "danger");
        }
    });

    byId("userForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const id = byId("userId").value;
        try {
            const payload = userPayload(form);
            const response = id
                ? await Api.put(`/api/usuarios/${id}`, payload)
                : await Api.post("/api/usuarios", payload);
            userModal.hide();
            await loadUsers();
            setAlert(response.message || (id ? "Usuário atualizado com sucesso." : "Usuário cadastrado com sucesso."));
        } catch (error) {
            setAlert(error.message, "danger");
        }
    });

    byId("passwordForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const id = byId("passwordUserId").value;
        const data = formDataObject(form);
        try {
            const { message } = await Api.post(`/api/usuarios/${id}/resetar-senha`, data);
            passwordModal.hide();
            setAlert(message || "Senha atualizada com sucesso.");
        } catch (error) {
            setAlert(error.message, "danger");
        }
    });
})();
