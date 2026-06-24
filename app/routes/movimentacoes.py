from flask import Blueprint, current_app, request
from ..database import get_db, rows_to_list
from ..services.auth_utils import login_required, current_user_name
from ..services.helpers import api_ok, api_error, parse_int
from ..services.stock_movements import StockError, actor_name, register_product_movement

movimentacoes_bp = Blueprint("movimentacoes", __name__)


@movimentacoes_bp.get("")
@login_required
def listar():
    limit = min(parse_int(request.args.get("limit"), 50), 200)
    produto_id = request.args.get("produto_id")
    params = []
    where = []
    if produto_id:
        where.append("m.produto_id = ?")
        params.append(produto_id)
    sql = """
        SELECT m.*, p.nome AS produto_nome, p.codigo AS produto_codigo, u.nome AS usuario_nome, u.username AS usuario_username
        FROM movimentacoes m
        JOIN produtos p ON p.id = m.produto_id
        LEFT JOIN usuarios u ON u.id = m.usuario_id
    """
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY m.data_hora DESC LIMIT ?"
    params.append(limit)
    with get_db() as db:
        return api_ok({"movimentacoes": rows_to_list(db.execute(sql, params).fetchall())})


@movimentacoes_bp.post("/entrada")
@login_required
def entrada():
    data = request.get_json(silent=True) or {}
    data["recebido_por"] = current_user_name()
    produto_id = data.get("produto_id")
    qtd = parse_int(data.get("quantidade"))
    if not produto_id or qtd <= 0:
        return api_error("Informe produto e quantidade maior que zero.", 400)
    with get_db() as db:
        try:
            db.execute("BEGIN IMMEDIATE")
            _, mov_id, depois = register_product_movement(db, produto_id, "entrada", qtd, data)
            db.commit()
            return api_ok({"movimentacao_id": mov_id, "quantidade_atual": depois}, "Entrada registrada.")
        except StockError as error:
            db.rollback()
            return api_error(error.message, error.status)
        except Exception:
            current_app.logger.exception("Erro ao registrar entrada do produto %s", produto_id)
            db.rollback()
            return api_error("Não foi possível registrar a entrada.", 500)


@movimentacoes_bp.post("/retirada")
@login_required
def retirada():
    data = request.get_json(silent=True) or {}
    data["entregue_por"] = current_user_name()
    produto_id = data.get("produto_id")
    qtd = parse_int(data.get("quantidade"))
    if not produto_id or qtd <= 0:
        return api_error("Informe produto e quantidade maior que zero.", 400)
    if not data.get("entregue_para"):
        return api_error("Informe quem recebeu o produto.", 400)
    with get_db() as db:
        try:
            db.execute("BEGIN IMMEDIATE")
            _, mov_id, depois = register_product_movement(db, produto_id, "retirada", qtd, data)
            db.commit()
            return api_ok({"movimentacao_id": mov_id, "quantidade_atual": depois}, "Retirada registrada.")
        except StockError as error:
            db.rollback()
            return api_error(error.message, error.status)
        except Exception:
            current_app.logger.exception("Erro ao registrar retirada do produto %s", produto_id)
            db.rollback()
            return api_error("Não foi possível registrar a retirada.", 500)


@movimentacoes_bp.post("/descarte")
@login_required
def descarte():
    data = request.get_json(silent=True) or {}
    data["descartado_por"] = current_user_name()
    produto_id = data.get("produto_id")
    qtd = parse_int(data.get("quantidade"))
    if not produto_id or qtd <= 0:
        return api_error("Informe produto e quantidade maior que zero.", 400)
    if not data.get("motivo"):
        return api_error("Informe o motivo do descarte.", 400)
    with get_db() as db:
        try:
            db.execute("BEGIN IMMEDIATE")
            _, mov_id, depois = register_product_movement(db, produto_id, "descarte", qtd, data)
            db.commit()
            return api_ok({"movimentacao_id": mov_id, "quantidade_atual": depois}, "Descarte registrado.")
        except StockError as error:
            db.rollback()
            return api_error(error.message, error.status)
        except Exception:
            current_app.logger.exception("Erro ao registrar descarte do produto %s", produto_id)
            db.rollback()
            return api_error("Não foi possível registrar o descarte.", 500)


@movimentacoes_bp.post("/emprestimo")
@login_required
def emprestimo():
    data = request.get_json(silent=True) or {}
    data["entregue_por"] = current_user_name()
    produto_id = data.get("produto_id")
    qtd = parse_int(data.get("quantidade"))
    if not produto_id or qtd <= 0:
        return api_error("Informe produto e quantidade maior que zero.", 400)
    if not data.get("emprestado_para"):
        return api_error("Informe para quem foi emprestado.", 400)
    with get_db() as db:
        try:
            db.execute("BEGIN IMMEDIATE")
            produto, mov_id, depois = register_product_movement(db, produto_id, "emprestimo", qtd, data)
            emp_cur = db.execute(
                """
                INSERT INTO emprestimos
                (produto_id, quantidade, entregue_por, emprestado_para, destino, observacao,
                 status, movimentacao_emprestimo_id)
                VALUES (?, ?, ?, ?, ?, ?, 'aberto', ?)
                """,
                (
                    produto_id,
                    qtd,
                    data.get("entregue_por") or actor_name(),
                    data.get("emprestado_para"),
                    data.get("destino"),
                    data.get("observacao"),
                    mov_id,
                ),
            )
            db.commit()
            return api_ok({"emprestimo_id": emp_cur.lastrowid, "movimentacao_id": mov_id, "quantidade_atual": depois}, "Empréstimo registrado.")
        except StockError as error:
            db.rollback()
            return api_error(error.message, error.status)
        except Exception:
            current_app.logger.exception("Erro ao registrar empréstimo do produto %s", produto_id)
            db.rollback()
            return api_error("Não foi possível registrar o empréstimo.", 500)
