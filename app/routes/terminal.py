from flask import Blueprint, current_app, request
from ..database import get_db, row_to_dict
from ..services.helpers import api_error, api_ok, audit
from ..services.terminal_service import TerminalService, TerminalOperationError

terminal_bp = Blueprint("terminal", __name__)
TERMINAL_OPERATOR_NAME = "Terminal do estoque"


@terminal_bp.get("/status")
def status():
    with get_db() as db:
        users_list = db.execute("SELECT id, nome, username FROM usuarios WHERE ativo = 1 ORDER BY nome").fetchall()
        return api_ok({
            "online": True,
            "usuario_logado": {
                "nome": TERMINAL_OPERATOR_NAME,
                "username": "terminal",
                "perfil": "terminal",
            },
            "usuarios_ativos": [row_to_dict(u) for u in users_list],
            "scanner_ativo": True,
            "versao": "1.0.0",
        }, "Terminal pronto.")


@terminal_bp.get("/scan/<codigo>")
def scan(codigo):
    with get_db() as db:
        try:
            result = TerminalService.resolve_scan(db, codigo)
            audit(db, None, "scan", "terminal", None, str(codigo))
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
def action():
    data = request.get_json(silent=True) or {}
    with get_db() as db:
        try:
            result = TerminalService.handle_action(db, data, None, TERMINAL_OPERATOR_NAME)
            db.commit()
            return api_ok(result, "Operação registrada.")
        except TerminalOperationError as error:
            db.rollback()
            return api_error(error.message, error.status)
        except Exception:
            current_app.logger.exception("Erro ao executar ação do terminal")
            db.rollback()
            return api_error("Não foi possível concluir a operação.", 500)
