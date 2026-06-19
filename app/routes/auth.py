from flask import Blueprint, request, session
from werkzeug.security import check_password_hash
from ..database import get_db, row_to_dict
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
        user = db.execute("SELECT * FROM usuarios WHERE username = ? AND ativo = 1", (username,)).fetchone()
        if not user or not check_password_hash(user["password_hash"], password):
            return api_error("Usuário ou senha inválidos.", 401)
        session["user_id"] = user["id"]
        session["username"] = user["username"]
        session["nome"] = user["nome"]
        session["perfil"] = user["perfil"]
        return api_ok({"user": {"id": user["id"], "username": user["username"], "nome": user["nome"], "perfil": user["perfil"]}})


@auth_bp.post("/logout")
def logout():
    session.clear()
    return api_ok(message="Logout realizado.")


@auth_bp.get("/me")
def me():
    if not session.get("user_id"):
        return api_error("Não autenticado.", 401)
    with get_db() as db:
        user = db.execute("SELECT id, username, nome, perfil FROM usuarios WHERE id = ?", (session["user_id"],)).fetchone()
        return api_ok({"user": row_to_dict(user)})
