from flask import Blueprint, request
from ..database import get_db, rows_to_list, row_to_dict
from ..services.auth_utils import login_required, current_user_id
from ..services.helpers import api_ok, api_error, audit

localizacoes_bp = Blueprint("localizacoes", __name__)


@localizacoes_bp.get("")
@login_required
def listar():
    armario = request.args.get("armario")
    prateleira = request.args.get("prateleira")
    params = []
    where = ["l.ativo = 1"]
    if armario:
        where.append("l.armario = ?")
        params.append(armario)
    if prateleira:
        where.append("l.prateleira = ?")
        params.append(prateleira)

    sql = f"""
        SELECT l.*, COUNT(p.id) AS produtos_count, COALESCE(SUM(p.quantidade_atual), 0) AS unidades_total
        FROM localizacoes l
        LEFT JOIN produtos p ON p.localizacao_id = l.id AND p.ativo = 1
        WHERE {' AND '.join(where)}
        GROUP BY l.id
        ORDER BY l.armario, l.prateleira, l.ordem, l.nome
    """
    with get_db() as db:
        return api_ok({"localizacoes": rows_to_list(db.execute(sql, params).fetchall())})


@localizacoes_bp.get("/prateleiras")
@login_required
def prateleiras():
    with get_db() as db:
        rows = db.execute("SELECT * FROM prateleiras WHERE ativo = 1 ORDER BY armario, ordem").fetchall()
        return api_ok({"prateleiras": rows_to_list(rows)})


@localizacoes_bp.get("/<codigo>")
@login_required
def detalhe(codigo):
    with get_db() as db:
        loc = db.execute("SELECT * FROM localizacoes WHERE codigo = ? AND ativo = 1", (codigo,)).fetchone()
        if not loc:
            return api_error("Localização não encontrada.", 404)
        produtos = db.execute(
            "SELECT id, codigo, nome, quantidade_atual, estoque_minimo FROM produtos WHERE localizacao_id = ? AND ativo = 1 ORDER BY nome",
            (loc["id"],),
        ).fetchall()
        return api_ok({"localizacao": row_to_dict(loc), "produtos": rows_to_list(produtos)})


@localizacoes_bp.post("")
@login_required
def criar():
    data = request.get_json(silent=True) or {}
    required = ["codigo", "nome", "armario", "prateleira"]
    for field in required:
        if not data.get(field):
            return api_error(f"Campo obrigatório: {field}.", 400)
    with get_db() as db:
        pr = db.execute("SELECT id FROM prateleiras WHERE armario = ? AND codigo = ? AND ativo = 1", (data["armario"], data["prateleira"])).fetchone()
        if not pr:
            return api_error("Prateleira inválida.", 400)
        try:
            cur = db.execute(
                """
                INSERT INTO localizacoes (codigo, nome, descricao, armario, prateleira, ordem, ativo)
                VALUES (?, ?, ?, ?, ?, ?, 1)
                """,
                (data["codigo"].strip().upper(), data["nome"].strip(), data.get("descricao"), data["armario"], data["prateleira"], int(data.get("ordem") or 0)),
            )
            audit(db, current_user_id(), "criar", "localizacao", cur.lastrowid, data["codigo"])
            db.commit()
            return api_ok({"id": cur.lastrowid}, "Localização criada.", 201)
        except Exception as exc:
            return api_error("Não foi possível criar a localização. Verifique se o código já existe.", 400)


@localizacoes_bp.put("/<int:loc_id>")
@login_required
def atualizar(loc_id):
    data = request.get_json(silent=True) or {}
    with get_db() as db:
        loc = db.execute("SELECT * FROM localizacoes WHERE id = ? AND ativo = 1", (loc_id,)).fetchone()
        if not loc:
            return api_error("Localização não encontrada.", 404)
        nome = data.get("nome", loc["nome"])
        descricao = data.get("descricao", loc["descricao"])
        armario = data.get("armario", loc["armario"])
        prateleira = data.get("prateleira", loc["prateleira"])
        ordem = int(data.get("ordem", loc["ordem"]) or 0)
        pr = db.execute("SELECT id FROM prateleiras WHERE armario = ? AND codigo = ? AND ativo = 1", (armario, prateleira)).fetchone()
        if not pr:
            return api_error("Prateleira inválida.", 400)
        db.execute(
            "UPDATE localizacoes SET nome = ?, descricao = ?, armario = ?, prateleira = ?, ordem = ? WHERE id = ?",
            (nome, descricao, armario, prateleira, ordem, loc_id),
        )
        audit(db, current_user_id(), "editar", "localizacao", loc_id, loc["codigo"])
        db.commit()
        return api_ok(message="Localização atualizada.")


@localizacoes_bp.delete("/<int:loc_id>")
@login_required
def excluir(loc_id):
    with get_db() as db:
        loc = db.execute("SELECT * FROM localizacoes WHERE id = ? AND ativo = 1", (loc_id,)).fetchone()
        if not loc:
            return api_error("Localização não encontrada.", 404)
        count = db.execute("SELECT COUNT(*) AS c FROM produtos WHERE localizacao_id = ? AND ativo = 1", (loc_id,)).fetchone()["c"]
        if count > 0:
            return api_error("Não é possível excluir uma localização com produtos. Mova os produtos primeiro.", 409)
        db.execute("UPDATE localizacoes SET ativo = 0 WHERE id = ?", (loc_id,))
        audit(db, current_user_id(), "excluir", "localizacao", loc_id, loc["codigo"])
        db.commit()
        return api_ok(message="Localização removida.")
