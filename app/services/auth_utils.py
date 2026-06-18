from functools import wraps
from flask import session, jsonify
from ..database import get_db


def current_user_id():
    return session.get("user_id")


def current_user_name():
    user_id = current_user_id()
    if not user_id:
        return None
    with get_db() as db:
        user = db.execute("SELECT nome, username FROM usuarios WHERE id = ?", (user_id,)).fetchone()
        return (user["nome"] or user["username"]) if user else None


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("user_id"):
            return jsonify({"ok": False, "error": "Autenticação obrigatória."}), 401
        return fn(*args, **kwargs)
    return wrapper
