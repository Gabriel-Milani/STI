from functools import wraps
import hmac
import secrets

from flask import request, session, jsonify
from ..database import get_db

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
CSRF_EXEMPT_PATHS = {"/api/auth/login"}


def csrf_exempt_path(path):
    return path == "/api/terminal" or path.startswith("/api/terminal/")


def current_user_id():
    return session.get("user_id")


def ensure_csrf_token():
    token = session.get("csrf_token")
    if not token:
        token = secrets.token_urlsafe(32)
        session["csrf_token"] = token
    return token


def csrf_response_data():
    return {"csrf_token": ensure_csrf_token()}


def csrf_protect():
    if request.method in SAFE_METHODS or not request.path.startswith("/api/"):
        return None
    if request.path in CSRF_EXEMPT_PATHS or csrf_exempt_path(request.path):
        return None
    expected = session.get("csrf_token")
    provided = request.headers.get("X-CSRF-Token") or request.form.get("csrf_token")
    if not expected or not provided or not hmac.compare_digest(expected, provided):
        return jsonify({"ok": False, "error": "Token de segurança inválido. Recarregue a página e tente novamente."}), 403
    return None


def current_user_name():
    if session.get("nome") or session.get("username"):
        return session.get("nome") or session.get("username")
    user_id = current_user_id()
    if not user_id:
        return None
    with get_db() as db:
        user = db.execute("SELECT nome, username FROM usuarios WHERE id = ?", (user_id,)).fetchone()
        return (user["nome"] or user["username"]) if user else None


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user_id = session.get("user_id")
        if not user_id:
            return jsonify({"ok": False, "error": "Autenticação obrigatória."}), 401
        with get_db() as db:
            user = db.execute("SELECT id, nome, username, perfil, ativo FROM usuarios WHERE id = ?", (user_id,)).fetchone()
            if not user or not user["ativo"]:
                session.clear()
                return jsonify({"ok": False, "error": "Usuário inativo. Procure o responsável pelo sistema."}), 403
            session["nome"] = user["nome"]
            session["username"] = user["username"]
            session["perfil"] = user["perfil"]
            session["usuario_id"] = user["id"]
        return fn(*args, **kwargs)
    return wrapper


def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user_id = session.get("user_id")
        if not user_id:
            return jsonify({"ok": False, "error": "Autenticação obrigatória."}), 401
        with get_db() as db:
            user = db.execute("SELECT id, nome, username, perfil, ativo FROM usuarios WHERE id = ?", (user_id,)).fetchone()
            if not user or not user["ativo"]:
                session.clear()
                return jsonify({"ok": False, "error": "Usuário inativo. Procure o responsável pelo sistema."}), 403
            if user["perfil"] != "admin":
                return jsonify({"ok": False, "error": "Acesso restrito a administradores."}), 403
            session["nome"] = user["nome"]
            session["username"] = user["username"]
            session["perfil"] = user["perfil"]
            session["usuario_id"] = user["id"]
        return fn(*args, **kwargs)
    return wrapper
