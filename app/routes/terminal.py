from flask import Blueprint, current_app, request, send_from_directory
from ..database import get_db, row_to_dict
from ..services.auth_utils import login_required, current_user_id, current_user_name
from ..services.helpers import api_error, api_ok, audit
from ..services.terminal_service import TerminalService, TerminalOperationError

terminal_bp = Blueprint("terminal", __name__)


@terminal_bp.get("")
def page():
    return send_from_directory("frontend", "terminal.html")


@terminal_bp.get("/status")
@login_required
def status():
    with get_db() as db:
        user = db.execute("SELECT nome, username, perfil FROM usuarios WHERE id = ?", (current_user_id(),)).fetchone()
        users_list = db.execute("SELECT id, nome, username FROM usuarios WHERE ativo = 1 ORDER BY nome").fetchall()
        return api_ok({
            "online": True,
            "usuario_logado": row_to_dict(user),
            "usuarios_ativos": [row_to_dict(u) for u in users_list],
            "scanner_ativo": True,
            "versao": "1.0.0",
        }, "Terminal pronto.")


@terminal_bp.get("/scan/<codigo>")
@login_required
def scan(codigo):
    with get_db() as db:
        try:
            result = TerminalService.resolve_scan(db, codigo, current_user_id())
            audit(db, current_user_id(), "scan", "terminal", None, str(codigo))
            db.commit()
            return api_ok(result)
        except TerminalOperationError as error:
            db.rollback()
            return api_error(error.message, error.status)
        except Exception:
            current_app.logger.exception("Erro ao processar scan do terminal")
            db.rollback()
            return api_error("Não foi possível processar o código lido.", 500)


@terminal_bp.post("/action")
@login_required
def action():
    data = request.get_json(silent=True) or {}
    with get_db() as db:
        try:
            result = TerminalService.handle_action(db, data, current_user_id(), current_user_name())
            db.commit()
            return api_ok(result, "Operação registrada.")
        except TerminalOperationError as error:
            db.rollback()
            return api_error(error.message, error.status)
        except Exception:
            current_app.logger.exception("Erro ao executar ação do terminal")
            db.rollback()
            return api_error("Não foi possível concluir a operação.", 500)
