from flask import Blueprint, request
from ..database import get_db, rows_to_list
from ..services.auth_utils import login_required, current_user_id, current_user_name
from ..services.helpers import api_ok, api_error, parse_int, audit
from ..services.stock_movements import StockError, actor_name, create_mov, register_product_movement
from ..services.unidades import available_count, sync_product_quantity

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
            _, mov_id, depois, _ = register_product_movement(db, produto_id, "entrada", qtd, data)
            db.commit()
            return api_ok({"movimentacao_id": mov_id, "quantidade_atual": depois}, "Entrada registrada.")
        except StockError as error:
            db.rollback()
            return api_error(error.message, error.status)
        except Exception:
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
            _, mov_id, depois, _ = register_product_movement(db, produto_id, "retirada", qtd, data)
            db.commit()
            return api_ok({"movimentacao_id": mov_id, "quantidade_atual": depois}, "Retirada registrada.")
        except StockError as error:
            db.rollback()
            return api_error(error.message, error.status)
        except Exception:
            db.rollback()
            return api_error("Não foi possível registrar a retirada.", 500)


def register_unit_movement(db, codigo_unidade, tipo, data):
    unidade = db.execute(
        """
        SELECT u.*, p.nome AS produto_nome, p.codigo AS produto_codigo
        FROM produto_unidades u
        JOIN produtos p ON p.id = u.produto_id
        WHERE p.ativo = 1 AND u.codigo_unidade = ?
        """,
        (codigo_unidade,),
    ).fetchone()
    if not unidade:
        raise StockError("Unidade não encontrada.", 404)

    produto = db.execute("SELECT * FROM produtos WHERE id = ? AND ativo = 1", (unidade["produto_id"],)).fetchone()
    if not produto:
        raise StockError("Produto não encontrado.", 404)

    if tipo == "entrada":
        if unidade["status"] == "disponivel":
            raise StockError("Essa unidade já está disponível.", 409)
        if unidade["status"] in ("emprestado", "descartado"):
            raise StockError("Essa unidade não pode receber entrada direta neste status.", 409)
        novo_status = "disponivel"
    elif tipo == "retirada":
        if unidade["status"] != "disponivel":
            raise StockError("Essa unidade não está disponível para retirada.", 409)
        novo_status = "retirado"
    else:
        raise StockError("Tipo de movimentação inválido.", 400)

    antes = available_count(db, produto["id"])
    db.execute("UPDATE produto_unidades SET status = ? WHERE id = ?", (novo_status, unidade["id"]))
    depois = sync_product_quantity(db, produto["id"])
    changed = [{
        "id": unidade["id"],
        "codigo_unidade": unidade["codigo_unidade"],
        "status_antes": unidade["status"],
        "status_depois": novo_status,
    }]
    mov_id = create_mov(db, produto, tipo, 1, antes, depois, data, changed)
    signal = "+" if tipo == "entrada" else "-"
    audit(db, current_user_id(), tipo, "produto_unidade", unidade["id"], f"{signal}1 {unidade['codigo_unidade']}")
    return mov_id, depois


@movimentacoes_bp.post("/unidade/entrada")
@login_required
def entrada_unidade():
    data = request.get_json(silent=True) or {}
    data["recebido_por"] = current_user_name()
    codigo_unidade = (data.get("codigo_unidade") or "").strip()
    if not codigo_unidade:
        return api_error("Informe o código da unidade.", 400)
    with get_db() as db:
        try:
            db.execute("BEGIN IMMEDIATE")
            mov_id, depois = register_unit_movement(db, codigo_unidade, "entrada", data)
            db.commit()
            return api_ok({"movimentacao_id": mov_id, "quantidade_atual": depois}, "Entrada da unidade registrada.")
        except StockError as error:
            db.rollback()
            return api_error(error.message, error.status)
        except Exception:
            db.rollback()
            return api_error("Não foi possível registrar a entrada da unidade.", 500)


@movimentacoes_bp.post("/unidade/retirada")
@login_required
def retirada_unidade():
    data = request.get_json(silent=True) or {}
    data["entregue_por"] = current_user_name()
    data["entregue_para"] = data.get("entregue_para") or "Leitura rápida"
    codigo_unidade = (data.get("codigo_unidade") or "").strip()
    if not codigo_unidade:
        return api_error("Informe o código da unidade.", 400)
    with get_db() as db:
        try:
            db.execute("BEGIN IMMEDIATE")
            mov_id, depois = register_unit_movement(db, codigo_unidade, "retirada", data)
            db.commit()
            return api_ok({"movimentacao_id": mov_id, "quantidade_atual": depois}, "Retirada da unidade registrada.")
        except StockError as error:
            db.rollback()
            return api_error(error.message, error.status)
        except Exception:
            db.rollback()
            return api_error("Não foi possível registrar a retirada da unidade.", 500)


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
            _, mov_id, depois, _ = register_product_movement(db, produto_id, "descarte", qtd, data)
            db.commit()
            return api_ok({"movimentacao_id": mov_id, "quantidade_atual": depois}, "Descarte registrado.")
        except StockError as error:
            db.rollback()
            return api_error(error.message, error.status)
        except Exception:
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
            produto, mov_id, depois, unidades = register_product_movement(db, produto_id, "emprestimo", qtd, data)
            codigos = ",".join([u["codigo_unidade"] for u in unidades]) if unidades else None
            emp_cur = db.execute(
                """
                INSERT INTO emprestimos
                (produto_id, quantidade, entregue_por, emprestado_para, destino, observacao,
                 unidades_codigos, status, movimentacao_emprestimo_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'aberto', ?)
                """,
                (
                    produto_id,
                    qtd,
                    data.get("entregue_por") or actor_name(),
                    data.get("emprestado_para"),
                    data.get("destino"),
                    data.get("observacao"),
                    codigos,
                    mov_id,
                ),
            )
            db.commit()
            return api_ok({"emprestimo_id": emp_cur.lastrowid, "movimentacao_id": mov_id, "quantidade_atual": depois}, "Empréstimo registrado.")
        except StockError as error:
            db.rollback()
            return api_error(error.message, error.status)
        except Exception:
            db.rollback()
            return api_error("Não foi possível registrar o empréstimo.", 500)
