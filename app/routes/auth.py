import os

from flask import Blueprint, request, session
from werkzeug.security import check_password_hash
from ..database import get_db, row_to_dict
from ..services.auth_utils import csrf_response_data, ensure_csrf_token
from ..services.helpers import api_ok, api_error

auth_bp = Blueprint("auth", __name__)


@auth_bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    if not username or not password:
        return api_error("Informe usuário e senha.", 400)

    with get_db() as db:
        user = db.execute("SELECT * FROM usuarios WHERE username = ?", (username,)).fetchone()
        if not user or not check_password_hash(user["password_hash"], password):
            return api_error("Usuário ou senha inválidos.", 401)
        if not user["ativo"]:
            return api_error("Usuário inativo. Procure o responsável pelo sistema.", 403)
        if (
            os.getenv("FLASK_ENV") == "production"
            and user["username"] == "admin"
            and check_password_hash(user["password_hash"], "admin123")
        ):
            return api_error("Senha padrão do administrador bloqueada em produção. Altere a senha antes de continuar.", 403)
        db.execute("UPDATE usuarios SET ultimo_login = CURRENT_TIMESTAMP WHERE id = ?", (user["id"],))
        db.commit()
        session["user_id"] = user["id"]
        session["usuario_id"] = user["id"]
        session["username"] = user["username"]
        session["nome"] = user["nome"]
        session["perfil"] = user["perfil"]
        ensure_csrf_token()
        return api_ok({
            "user": {"id": user["id"], "username": user["username"], "nome": user["nome"], "perfil": user["perfil"]},
            **csrf_response_data(),
        })


@auth_bp.post("/logout")
def logout():
    session.clear()
    return api_ok(message="Logout realizado.")


@auth_bp.get("/me")
def me():
    if not session.get("user_id"):
        return api_error("Não autenticado.", 401)
    with get_db() as db:
        user = db.execute("SELECT id, username, nome, perfil, ativo FROM usuarios WHERE id = ?", (session["user_id"],)).fetchone()
        if not user:
            session.clear()
            return api_error("Não autenticado.", 401)
        if not user["ativo"]:
            session.clear()
            return api_error("Usuário inativo. Procure o responsável pelo sistema.", 403)
        return api_ok({"user": row_to_dict(user), **csrf_response_data()})
