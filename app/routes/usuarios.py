from flask import Blueprint, request
from werkzeug.security import generate_password_hash
from ..database import get_db, rows_to_list, row_to_dict
from ..services.auth_utils import admin_required, current_user_id
from ..services.helpers import api_ok, api_error, audit

usuarios_bp = Blueprint("usuarios", __name__)


def clean_username(value):
    return (value or "").strip()


def validate_password(senha, confirmacao):
    if not senha:
        return "Informe a senha."
    if len(senha) < 4:
        return "A senha deve ter pelo menos 4 caracteres."
    if senha != confirmacao:
        return "A confirmação de senha não confere."
    return None


def active_users_count(db):
    return db.execute("SELECT COUNT(*) AS total FROM usuarios WHERE ativo = 1").fetchone()["total"]


@usuarios_bp.get("")
@admin_required
def listar():
    with get_db() as db:
        rows = db.execute(
            """
            SELECT id, nome, username AS usuario, ativo, criado_em, atualizado_em, ultimo_login
            FROM usuarios
            ORDER BY ativo DESC, nome
            """
        ).fetchall()
        return api_ok({"usuarios": rows_to_list(rows)})


@usuarios_bp.post("")
@admin_required
def criar():
    data = request.get_json(silent=True) or {}
    nome = (data.get("nome") or "").strip()
    username = clean_username(data.get("usuario") or data.get("username"))
    senha = data.get("senha") or ""
    confirmar = data.get("confirmar_senha") or data.get("confirmacao") or ""
    ativo = 1 if data.get("ativo", True) in (True, 1, "1", "true", "on", "sim") else 0
    if not nome:
        return api_error("Informe o nome completo.", 400)
    if not username:
        return api_error("Informe o usuário.", 400)
    password_error = validate_password(senha, confirmar)
    if password_error:
        return api_error(password_error, 400)
    with get_db() as db:
        if db.execute("SELECT id FROM usuarios WHERE username = ?", (username,)).fetchone():
            return api_error("Usuário já cadastrado.", 409)
        cur = db.execute(
            """
            INSERT INTO usuarios (username, nome, password_hash, perfil, ativo)
            VALUES (?, ?, ?, 'operador', ?)
            """,
            (username, nome, generate_password_hash(senha), ativo),
        )
        audit(db, current_user_id(), "criar", "usuario", cur.lastrowid, username)
        db.commit()
        return api_ok({"id": cur.lastrowid}, "Usuário cadastrado com sucesso.", 201)


@usuarios_bp.put("/<int:usuario_id>")
@admin_required
def atualizar(usuario_id):
    data = request.get_json(silent=True) or {}
    nome = (data.get("nome") or "").strip()
    username = clean_username(data.get("usuario") or data.get("username"))
    ativo = 1 if data.get("ativo", True) in (True, 1, "1", "true", "on", "sim") else 0
    if not nome:
        return api_error("Informe o nome completo.", 400)
    if not username:
        return api_error("Informe o usuário.", 400)
    with get_db() as db:
        user = db.execute("SELECT * FROM usuarios WHERE id = ?", (usuario_id,)).fetchone()
        if not user:
            return api_error("Usuário não encontrado.", 404)
        duplicate = db.execute("SELECT id FROM usuarios WHERE username = ? AND id <> ?", (username, usuario_id)).fetchone()
        if duplicate:
            return api_error("Usuário já cadastrado.", 409)
        if user["ativo"] and not ativo and active_users_count(db) <= 1:
            return api_error("Não é possível desativar o último usuário ativo.", 409)
        db.execute(
            "UPDATE usuarios SET nome = ?, username = ?, ativo = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?",
            (nome, username, ativo, usuario_id),
        )
        audit(db, current_user_id(), "editar", "usuario", usuario_id, username)
        db.commit()
        return api_ok(message="Usuário atualizado com sucesso.")


@usuarios_bp.post("/<int:usuario_id>/desativar")
@admin_required
def desativar(usuario_id):
    with get_db() as db:
        user = db.execute("SELECT * FROM usuarios WHERE id = ?", (usuario_id,)).fetchone()
        if not user:
            return api_error("Usuário não encontrado.", 404)
        if not user["ativo"]:
            return api_ok(message="Usuário já está inativo.")
        if active_users_count(db) <= 1:
            return api_error("Não é possível desativar o último usuário ativo.", 409)
        db.execute("UPDATE usuarios SET ativo = 0, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?", (usuario_id,))
        audit(db, current_user_id(), "desativar", "usuario", usuario_id, user["username"])
        db.commit()
        return api_ok(message="Usuário desativado com sucesso.")


@usuarios_bp.post("/<int:usuario_id>/ativar")
@admin_required
def ativar(usuario_id):
    with get_db() as db:
        user = db.execute("SELECT * FROM usuarios WHERE id = ?", (usuario_id,)).fetchone()
        if not user:
            return api_error("Usuário não encontrado.", 404)
        db.execute("UPDATE usuarios SET ativo = 1, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?", (usuario_id,))
        audit(db, current_user_id(), "ativar", "usuario", usuario_id, user["username"])
        db.commit()
        return api_ok(message="Usuário ativado com sucesso.")


@usuarios_bp.post("/<int:usuario_id>/resetar-senha")
@admin_required
def resetar_senha(usuario_id):
    data = request.get_json(silent=True) or {}
    senha = data.get("senha") or data.get("nova_senha") or ""
    confirmar = data.get("confirmar_senha") or data.get("confirmar_nova_senha") or ""
    password_error = validate_password(senha, confirmar)
    if password_error:
        return api_error(password_error, 400)
    with get_db() as db:
        user = db.execute("SELECT * FROM usuarios WHERE id = ?", (usuario_id,)).fetchone()
        if not user:
            return api_error("Usuário não encontrado.", 404)
        db.execute(
            "UPDATE usuarios SET password_hash = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?",
            (generate_password_hash(senha), usuario_id),
        )
        audit(db, current_user_id(), "resetar_senha", "usuario", usuario_id, user["username"])
        db.commit()
        return api_ok(message="Senha atualizada com sucesso.")
