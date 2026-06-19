from flask import Blueprint, request
from ..database import get_db, rows_to_list
from ..services.auth_utils import login_required, current_user_id, current_user_name
from ..services.helpers import api_ok, api_error, parse_int, audit
from ..services.unidades import (
    attach_units_to_mov,
    change_units_status,
    create_units,
    is_unit_product,
    sync_product_quantity,
    take_available_units,
)

movimentacoes_bp = Blueprint("movimentacoes", __name__)


def rollback_error(db, message, status=400):
    db.rollback()
    return api_error(message, status)


def get_product(db, produto_id):
    return db.execute("SELECT * FROM produtos WHERE id = ? AND ativo = 1", (produto_id,)).fetchone()


def actor_name():
    return current_user_name() or "Usuário logado"


def create_mov(db, produto, tipo, qtd, antes, depois, data, unidades=None):
    origem = data.get("responsavel_origem") or data.get("entregue_por") or data.get("recebido_por") or data.get("descartado_por")
    if not origem and tipo in ("entrada", "retirada", "emprestimo", "descarte"):
        origem = actor_name()
    unidades_codigos = ",".join([u["codigo_unidade"] for u in unidades]) if unidades else None
    cur = db.execute(
        """
        INSERT INTO movimentacoes
        (produto_id, tipo, quantidade, quantidade_antes, quantidade_depois,
         responsavel_origem, responsavel_destino, destino, motivo, observacao, unidades_codigos,
         localizacao_origem_id, localizacao_destino_id, usuario_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            produto["id"],
            tipo,
            qtd,
            antes,
            depois,
            origem,
            data.get("responsavel_destino") or data.get("entregue_para") or data.get("emprestado_para"),
            data.get("destino"),
            data.get("motivo"),
            data.get("observacao"),
            unidades_codigos,
            produto["localizacao_id"],
            produto["localizacao_id"],
            current_user_id(),
        ),
    )
    if unidades:
        attach_units_to_mov(db, cur.lastrowid, unidades)
    return cur.lastrowid


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
            produto = get_product(db, produto_id)
            if not produto:
                return rollback_error(db, "Produto não encontrado.", 404)
            antes = produto["quantidade_atual"]
            unidades = []
            if is_unit_product(produto):
                unidades = create_units(db, produto, qtd, data.get("observacao"))
                depois = sync_product_quantity(db, produto_id)
            else:
                depois = antes + qtd
                db.execute("UPDATE produtos SET quantidade_atual = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?", (depois, produto_id))
            mov_id = create_mov(db, produto, "entrada", qtd, antes, depois, data, unidades)
            audit(db, current_user_id(), "entrada", "produto", produto_id, f"+{qtd}")
            db.commit()
            return api_ok({"movimentacao_id": mov_id, "quantidade_atual": depois}, "Entrada registrada.")
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
            produto = get_product(db, produto_id)
            if not produto:
                return rollback_error(db, "Produto não encontrado.", 404)
            antes = produto["quantidade_atual"]
            if qtd > antes:
                return rollback_error(db, "Não há estoque suficiente para essa retirada.", 409)
            unidades = []
            if is_unit_product(produto):
                selecionadas = take_available_units(db, produto_id, qtd)
                if not selecionadas:
                    return rollback_error(db, "Não há unidades disponíveis para essa retirada.", 409)
                unidades = change_units_status(db, selecionadas, "retirado")
                depois = sync_product_quantity(db, produto_id)
            else:
                depois = antes - qtd
                db.execute("UPDATE produtos SET quantidade_atual = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?", (depois, produto_id))
            mov_id = create_mov(db, produto, "retirada", qtd, antes, depois, data, unidades)
            audit(db, current_user_id(), "retirada", "produto", produto_id, f"-{qtd}")
            db.commit()
            return api_ok({"movimentacao_id": mov_id, "quantidade_atual": depois}, "Retirada registrada.")
        except Exception:
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
            produto = get_product(db, produto_id)
            if not produto:
                return rollback_error(db, "Produto não encontrado.", 404)
            antes = produto["quantidade_atual"]
            if qtd > antes:
                return rollback_error(db, "Não há estoque suficiente para esse descarte.", 409)
            unidades = []
            if is_unit_product(produto):
                selecionadas = take_available_units(db, produto_id, qtd)
                if not selecionadas:
                    return rollback_error(db, "Não há unidades disponíveis para esse descarte.", 409)
                unidades = change_units_status(db, selecionadas, "descartado")
                depois = sync_product_quantity(db, produto_id)
            else:
                depois = antes - qtd
                db.execute("UPDATE produtos SET quantidade_atual = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?", (depois, produto_id))
            mov_id = create_mov(db, produto, "descarte", qtd, antes, depois, data, unidades)
            audit(db, current_user_id(), "descarte", "produto", produto_id, f"-{qtd}")
            db.commit()
            return api_ok({"movimentacao_id": mov_id, "quantidade_atual": depois}, "Descarte registrado.")
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
            produto = get_product(db, produto_id)
            if not produto:
                return rollback_error(db, "Produto não encontrado.", 404)
            antes = produto["quantidade_atual"]
            if qtd > antes:
                return rollback_error(db, "Não há estoque suficiente para esse empréstimo.", 409)
            unidades = []
            if is_unit_product(produto):
                selecionadas = take_available_units(db, produto_id, qtd)
                if not selecionadas:
                    return rollback_error(db, "Não há unidades disponíveis para esse empréstimo.", 409)
                unidades = change_units_status(db, selecionadas, "emprestado")
                depois = sync_product_quantity(db, produto_id)
            else:
                depois = antes - qtd
                db.execute("UPDATE produtos SET quantidade_atual = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?", (depois, produto_id))
            mov_id = create_mov(db, produto, "emprestimo", qtd, antes, depois, data, unidades)
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
            audit(db, current_user_id(), "emprestimo", "produto", produto_id, f"-{qtd}")
            db.commit()
            return api_ok({"emprestimo_id": emp_cur.lastrowid, "movimentacao_id": mov_id, "quantidade_atual": depois}, "Empréstimo registrado.")
        except Exception:
            db.rollback()
            return api_error("Não foi possível registrar o empréstimo.", 500)
