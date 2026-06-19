from functools import wraps
from flask import session, jsonify
from ..database import get_db


def current_user_id():
    return session.get("user_id")


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
            user = db.execute("SELECT id, nome, username, ativo FROM usuarios WHERE id = ?", (user_id,)).fetchone()
            if not user or not user["ativo"]:
                session.clear()
                return jsonify({"ok": False, "error": "Usuário inativo. Procure o responsável pelo sistema."}), 403
            session["nome"] = user["nome"]
            session["username"] = user["username"]
            session["usuario_id"] = user["id"]
        return fn(*args, **kwargs)
    return wrapper
