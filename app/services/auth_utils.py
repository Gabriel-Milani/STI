from functools import wraps
from flask import session, jsonify


def current_user_id():
    return session.get("user_id")


def current_user_name():
    return session.get("nome") or session.get("username")


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("user_id"):
            return jsonify({"ok": False, "error": "Autenticação obrigatória."}), 401
        return fn(*args, **kwargs)
    return wrapper
