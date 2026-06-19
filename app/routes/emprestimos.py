from flask import Blueprint, request
from ..database import get_db, rows_to_list
from ..services.auth_utils import login_required, current_user_id, current_user_name
from ..services.helpers import api_ok, api_error, parse_int, audit
<<<<<<< HEAD
from ..services.unidades import attach_units_to_mov, change_units_status, is_unit_product, sync_product_quantity
=======
from ..services.unit_control import is_unit_product, record_movement_units, restore_units, split_codes, sync_unit_stock
>>>>>>> c8da6591bc55c3ea4cf2766c27e532b7609c9962

emprestimos_bp = Blueprint("emprestimos", __name__)


@emprestimos_bp.get("")
@login_required
def listar():
    status = request.args.get("status", "aberto")
    params = []
    where = []
    if status != "todos":
        where.append("e.status = ?")
        params.append(status)
    sql = """
        SELECT e.*, p.nome AS produto_nome, p.codigo AS produto_codigo
        FROM emprestimos e
        JOIN produtos p ON p.id = e.produto_id
    """
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY e.data_emprestimo DESC"
    with get_db() as db:
        return api_ok({"emprestimos": rows_to_list(db.execute(sql, params).fetchall())})


@emprestimos_bp.post("/<int:emprestimo_id>/devolver")
@login_required
def devolver(emprestimo_id):
    data = request.get_json(silent=True) or {}
<<<<<<< HEAD
    recebido_por = data.get("recebido_por") or current_user_name() or "Usuário logado"
    qtd_devolver = parse_int(data.get("quantidade"), None)
    with get_db() as db:
        emp = db.execute("SELECT * FROM emprestimos WHERE id = ?", (emprestimo_id,)).fetchone()
        if not emp:
            return api_error("Empréstimo não encontrado.", 404)
        if emp["status"] != "aberto":
            return api_error("Esse empréstimo já foi devolvido.", 409)
        qtd = emp["quantidade"] if qtd_devolver in (None, 0) else qtd_devolver
        if qtd <= 0 or qtd != emp["quantidade"]:
            return api_error("Nesta versão, a devolução deve ser integral.", 400)
        produto = db.execute("SELECT * FROM produtos WHERE id = ? AND ativo = 1", (emp["produto_id"],)).fetchone()
        if not produto:
            return api_error("Produto não encontrado.", 404)
        antes = produto["quantidade_atual"]
        unidades = []
        if is_unit_product(produto):
            unidades_emprestadas = db.execute(
                """
                SELECT u.*
                FROM movimentacao_unidades mu
                JOIN produto_unidades u ON u.id = mu.produto_unidade_id
                WHERE mu.movimentacao_id = ? AND u.status = 'emprestado'
                ORDER BY u.id
                """,
                (emp["movimentacao_emprestimo_id"],),
            ).fetchall()
            if len(unidades_emprestadas) != qtd:
                return api_error("Não foi possível localizar as unidades desse empréstimo.", 409)
            unidades = change_units_status(db, unidades_emprestadas, "disponivel")
            depois = sync_product_quantity(db, produto["id"])
        else:
            depois = antes + qtd
            db.execute("UPDATE produtos SET quantidade_atual = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?", (depois, produto["id"]))
        cur = db.execute(
            """
            INSERT INTO movimentacoes
            (produto_id, tipo, quantidade, quantidade_antes, quantidade_depois,
             responsavel_origem, responsavel_destino, observacao, localizacao_origem_id, localizacao_destino_id, usuario_id)
            VALUES (?, 'devolucao', ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (produto["id"], qtd, antes, depois, emp["emprestado_para"], recebido_por, data.get("observacao"), produto["localizacao_id"], produto["localizacao_id"], current_user_id()),
        )
        if unidades:
            attach_units_to_mov(db, cur.lastrowid, unidades)
        db.execute(
            "UPDATE emprestimos SET status='devolvido', data_devolucao=CURRENT_TIMESTAMP, recebido_por=?, movimentacao_devolucao_id=? WHERE id=?",
            (recebido_por, cur.lastrowid, emprestimo_id),
        )
        audit(db, current_user_id(), "devolucao", "emprestimo", emprestimo_id, f"+{qtd}")
        db.commit()
        return api_ok({"quantidade_atual": depois}, "Devolução registrada.")
=======
    recebido_por = current_user_name()
    if not recebido_por:
        return api_error("Informe quem recebeu a devolução.", 400)
    qtd_devolver = parse_int(data.get("quantidade"), None)
    with get_db() as db:
        try:
            db.execute("BEGIN IMMEDIATE")
            emp = db.execute("SELECT * FROM emprestimos WHERE id = ?", (emprestimo_id,)).fetchone()
            if not emp:
                db.rollback()
                return api_error("Empréstimo não encontrado.", 404)
            if emp["status"] != "aberto":
                db.rollback()
                return api_error("Esse empréstimo já foi devolvido.", 409)
            qtd = emp["quantidade"] if qtd_devolver in (None, 0) else qtd_devolver
            if qtd <= 0 or qtd != emp["quantidade"]:
                db.rollback()
                return api_error("Nesta versão, a devolução deve ser integral.", 400)
            produto = db.execute("SELECT * FROM produtos WHERE id = ? AND ativo = 1", (emp["produto_id"],)).fetchone()
            if not produto:
                db.rollback()
                return api_error("Produto não encontrado.", 404)
            antes = produto["quantidade_atual"]
            unidades_codigos = split_codes(emp["unidades_codigos"] if "unidades_codigos" in emp.keys() else None)
            if is_unit_product(produto):
                restore_units(db, unidades_codigos)
                depois = sync_unit_stock(db, produto["id"])
            else:
                depois = antes + qtd
                db.execute("UPDATE produtos SET quantidade_atual = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?", (depois, produto["id"]))
            cur = db.execute(
                """
                INSERT INTO movimentacoes
                (produto_id, tipo, quantidade, quantidade_antes, quantidade_depois,
                 responsavel_origem, responsavel_destino, observacao, unidades_codigos, localizacao_origem_id, localizacao_destino_id, usuario_id)
                VALUES (?, 'devolucao', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (produto["id"], qtd, antes, depois, emp["emprestado_para"], recebido_por, data.get("observacao"), ",".join(unidades_codigos) if unidades_codigos else None, produto["localizacao_id"], produto["localizacao_id"], current_user_id()),
            )
            record_movement_units(db, cur.lastrowid, unidades_codigos, "disponivel")
            db.execute(
                "UPDATE emprestimos SET status='devolvido', data_devolucao=CURRENT_TIMESTAMP, recebido_por=?, movimentacao_devolucao_id=? WHERE id=?",
                (recebido_por, cur.lastrowid, emprestimo_id),
            )
            audit(db, current_user_id(), "devolucao", "emprestimo", emprestimo_id, f"+{qtd}")
            db.commit()
            return api_ok({"quantidade_atual": depois}, "Devolução registrada.")
        except Exception:
            db.rollback()
            return api_error("Não foi possível registrar a devolução.", 500)
>>>>>>> c8da6591bc55c3ea4cf2766c27e532b7609c9962
