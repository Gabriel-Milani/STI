import re
import unicodedata

from flask import Blueprint, current_app, request
from ..database import get_db, rows_to_list, row_to_dict
from ..services.auth_utils import login_required, current_user_id
from ..services.helpers import api_ok, api_error, audit

localizacoes_bp = Blueprint("localizacoes", __name__)

SHELF_CAPACITY = 4
ARM01_SHELVES = [
    ("P1", "Limpeza e Pasta Térmica"),
    ("P2", "Cabos Telefone e Diversos"),
    ("P3", "Baterias / SSDs / Adaptadores"),
    ("P4", "DP/HDMI / Mouse / Adaptadores"),
    ("P5", "Fones / Impressora / Diversos"),
    ("P6", "Teclados e Cabos"),
]


def _location_slug(value):
    text = unicodedata.normalize("NFKD", value or "")
    text = text.encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^A-Za-z0-9]+", "-", text).strip("-").upper()
    return text or "AREA"


def _base_location_code(armario, prateleira, nome):
    return f"{armario.strip().upper()}-{prateleira.strip().upper()}-{_location_slug(nome)}"


def _unique_location_code(db, armario, prateleira, nome, ignore_id=None):
    base_code = _base_location_code(armario, prateleira, nome)
    candidate = base_code
    suffix = 2
    params = [candidate]
    ignore_clause = ""
    if ignore_id:
        ignore_clause = " AND id <> ?"
        params.append(ignore_id)

    while db.execute(
        f"SELECT id FROM localizacoes WHERE codigo = ?{ignore_clause}",
        params,
    ).fetchone():
        candidate = f"{base_code}-{suffix:02d}"
        params = [candidate]
        if ignore_id:
            params.append(ignore_id)
        suffix += 1
    return candidate


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


@localizacoes_bp.get("/resumo")
@login_required
def resumo():
    with get_db() as db:
        prateleiras_count = db.execute(
            "SELECT COUNT(*) AS c FROM prateleiras WHERE ativo = 1 AND armario = 'ARM01'"
        ).fetchone()["c"]
        localizacoes_ativas = db.execute(
            "SELECT COUNT(*) AS c FROM localizacoes WHERE ativo = 1 AND armario = 'ARM01'"
        ).fetchone()["c"]
        produtos_armazenados = db.execute(
            """
            SELECT COUNT(p.id) AS c
            FROM produtos p
            JOIN localizacoes l ON l.id = p.localizacao_id
            WHERE p.ativo = 1 AND l.ativo = 1
            """
        ).fetchone()["c"]
        capacidade = max(prateleiras_count, len(ARM01_SHELVES)) * SHELF_CAPACITY
        return api_ok({
            "armarios_ativos": 1,
            "armarios_planejados": 3,
            "prateleiras": prateleiras_count or len(ARM01_SHELVES),
            "localizacoes_ativas": localizacoes_ativas,
            "espacos_livres": max(capacidade - localizacoes_ativas, 0),
            "produtos_armazenados": produtos_armazenados,
        })


@localizacoes_bp.get("/mapa")
@login_required
def mapa():
    with get_db() as db:
        shelf_rows = db.execute(
            "SELECT * FROM prateleiras WHERE ativo = 1 AND armario = 'ARM01' ORDER BY ordem, codigo"
        ).fetchall()
        shelves = [(row["codigo"], row["nome"]) for row in shelf_rows] or ARM01_SHELVES
        stats = {
            row["prateleira"]: row
            for row in db.execute(
                """
                SELECT
                    l.prateleira,
                    COUNT(DISTINCT l.id) AS localizacoes,
                    COUNT(DISTINCT p.id) AS produtos
                FROM localizacoes l
                LEFT JOIN produtos p ON p.localizacao_id = l.id AND p.ativo = 1
                WHERE l.ativo = 1 AND l.armario = 'ARM01'
                GROUP BY l.prateleira
                """
            ).fetchall()
        }
        prateleiras_payload = []
        for codigo, nome in shelves:
            row = stats.get(codigo)
            localizacoes_count = row["localizacoes"] if row else 0
            produtos_count = row["produtos"] if row else 0
            ocupacao = min(round((localizacoes_count / SHELF_CAPACITY) * 100), 100)
            prateleiras_payload.append({
                "codigo": codigo,
                "nome": nome,
                "produtos": produtos_count,
                "localizacoes": localizacoes_count,
                "ocupacao_percentual": ocupacao,
            })

        return api_ok({
            "armarios": [{
                "codigo": "ARM01",
                "nome": "Armário principal do estoque",
                "status": "ativo",
                "descricao": "Único armário ativo no momento.",
                "prateleiras": prateleiras_payload,
            }],
            "planejados": [
                {"codigo": "ARM02", "nome": "Armário 02", "status": "planejado"},
                {"codigo": "ARM03", "nome": "Armário 03", "status": "planejado"},
                {"codigo": "OUTROS", "nome": "Outras áreas", "status": "futuro"},
            ],
        })


@localizacoes_bp.get("/prateleiras")
@login_required
def prateleiras():
    with get_db() as db:
        rows = db.execute("SELECT * FROM prateleiras WHERE ativo = 1 ORDER BY armario, ordem").fetchall()
        return api_ok({"prateleiras": rows_to_list(rows)})


@localizacoes_bp.post("/prateleiras")
@login_required
def criar_prateleira():
    data = request.get_json(silent=True) or {}
    armario = (data.get("armario") or "ARM01").strip().upper()
    codigo = (data.get("codigo") or "").strip().upper()
    nome = (data.get("nome") or "").strip()
    ordem = int(data.get("ordem") or 0)
    if not codigo or not nome:
        return api_error("Informe código e nome da prateleira.", 400)
    with get_db() as db:
        try:
            cur = db.execute(
                "INSERT INTO prateleiras (armario, codigo, nome, ordem, ativo) VALUES (?, ?, ?, ?, 1)",
                (armario, codigo, nome, ordem),
            )
            audit(db, current_user_id(), "criar", "prateleira", cur.lastrowid, f"{armario} > {codigo}")
            db.commit()
            return api_ok({"id": cur.lastrowid}, "Prateleira criada.", 201)
        except Exception:
            current_app.logger.exception("Erro ao criar prateleira")
            db.rollback()
            return api_error("Não foi possível criar a prateleira. Verifique se ela já existe.", 400)


@localizacoes_bp.get("/prateleiras/<armario>/<codigo>/detalhe")
@login_required
def detalhe_prateleira(armario, codigo):
    armario = armario.strip().upper()
    codigo = codigo.strip().upper()
    with get_db() as db:
        prateleira = db.execute(
            "SELECT * FROM prateleiras WHERE armario = ? AND codigo = ? AND ativo = 1",
            (armario, codigo),
        ).fetchone()
        if not prateleira:
            return api_error("Prateleira não encontrada.", 404)
        localizacoes = db.execute(
            """
            SELECT l.*, COUNT(p.id) AS produtos_count, COALESCE(SUM(p.quantidade_atual), 0) AS unidades_total
            FROM localizacoes l
            LEFT JOIN produtos p ON p.localizacao_id = l.id AND p.ativo = 1
            WHERE l.ativo = 1 AND l.armario = ? AND l.prateleira = ?
            GROUP BY l.id
            ORDER BY l.ordem, l.nome
            """,
            (armario, codigo),
        ).fetchall()
        produtos = db.execute(
            """
            SELECT p.id, p.codigo, p.nome, p.quantidade_atual, p.estoque_minimo,
                   l.codigo AS localizacao_codigo, l.nome AS localizacao_nome
            FROM produtos p
            JOIN localizacoes l ON l.id = p.localizacao_id
            WHERE p.ativo = 1 AND l.ativo = 1 AND l.armario = ? AND l.prateleira = ?
            ORDER BY l.ordem, l.nome, p.nome
            """,
            (armario, codigo),
        ).fetchall()
        next_order = db.execute(
            """
            SELECT COALESCE(MAX(ordem), 0) + 1 AS next_order
            FROM localizacoes
            WHERE ativo = 1 AND armario = ? AND prateleira = ?
            """,
            (armario, codigo),
        ).fetchone()["next_order"]
        suggested_code = _unique_location_code(db, armario, codigo, "Nova localização")
        return api_ok({
            "prateleira": row_to_dict(prateleira),
            "localizacoes": rows_to_list(localizacoes),
            "produtos": rows_to_list(produtos),
            "capacidade_estimada": SHELF_CAPACITY,
            "proxima_ordem": next_order,
            "codigo_sugerido": suggested_code,
        })


@localizacoes_bp.get("/codigo-sugerido")
@login_required
def codigo_sugerido():
    armario = (request.args.get("armario") or "ARM01").strip().upper()
    prateleira = (request.args.get("prateleira") or "").strip().upper()
    nome = (request.args.get("nome") or "").strip()
    ignore_id = request.args.get("id", type=int)
    if not prateleira or not nome:
        return api_error("Informe nome e prateleira para gerar o código.", 400)
    with get_db() as db:
        pr = db.execute("SELECT id FROM prateleiras WHERE armario = ? AND codigo = ? AND ativo = 1", (armario, prateleira)).fetchone()
        if not pr:
            return api_error("Prateleira inválida.", 400)
        return api_ok({"codigo": _unique_location_code(db, armario, prateleira, nome, ignore_id)})


@localizacoes_bp.put("/prateleiras/<int:prateleira_id>")
@login_required
def atualizar_prateleira(prateleira_id):
    data = request.get_json(silent=True) or {}
    with get_db() as db:
        prateleira = db.execute("SELECT * FROM prateleiras WHERE id = ? AND ativo = 1", (prateleira_id,)).fetchone()
        if not prateleira:
            return api_error("Prateleira não encontrada.", 404)
        nome = (data.get("nome", prateleira["nome"]) or "").strip()
        ordem = int(data.get("ordem", prateleira["ordem"]) or 0)
        if not nome:
            return api_error("Informe o nome da prateleira.", 400)
        db.execute("UPDATE prateleiras SET nome = ?, ordem = ? WHERE id = ?", (nome, ordem, prateleira_id))
        audit(db, current_user_id(), "editar", "prateleira", prateleira_id, f"{prateleira['armario']} > {prateleira['codigo']}")
        db.commit()
        return api_ok(message="Prateleira atualizada.")


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
    required = ["nome", "armario", "prateleira"]
    for field in required:
        if not data.get(field):
            return api_error(f"Campo obrigatório: {field}.", 400)
    armario = (data.get("armario") or "").strip().upper()
    prateleira = (data.get("prateleira") or "").strip().upper()
    nome = (data.get("nome") or "").strip()
    with get_db() as db:
        pr = db.execute("SELECT id FROM prateleiras WHERE armario = ? AND codigo = ? AND ativo = 1", (armario, prateleira)).fetchone()
        if not pr:
            return api_error("Prateleira inválida.", 400)
        codigo = _unique_location_code(db, armario, prateleira, nome)
        try:
            cur = db.execute(
                """
                INSERT INTO localizacoes (codigo, nome, descricao, armario, prateleira, ordem, ativo)
                VALUES (?, ?, ?, ?, ?, ?, 1)
                """,
                (codigo, nome, data.get("descricao"), armario, prateleira, int(data.get("ordem") or 0)),
            )
            audit(db, current_user_id(), "criar", "localizacao", cur.lastrowid, codigo)
            db.commit()
            return api_ok({"id": cur.lastrowid, "codigo": codigo}, "Localização criada.", 201)
        except Exception:
            current_app.logger.exception("Erro ao criar localização")
            db.rollback()
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
        codigo = _unique_location_code(db, armario, prateleira, nome, loc_id)
        db.execute(
            "UPDATE localizacoes SET codigo = ?, nome = ?, descricao = ?, armario = ?, prateleira = ?, ordem = ? WHERE id = ?",
            (codigo, nome, descricao, armario, prateleira, ordem, loc_id),
        )
        audit(db, current_user_id(), "editar", "localizacao", loc_id, f"{loc['codigo']} -> {codigo}")
        db.commit()
        return api_ok({"codigo": codigo}, "Localização atualizada.")


@localizacoes_bp.post("/<int:loc_id>/mover")
@login_required
def mover_localizacao(loc_id):
    data = request.get_json(silent=True) or {}
    armario = (data.get("armario") or "ARM01").strip().upper()
    prateleira = (data.get("prateleira") or "").strip().upper()
    ordem = int(data.get("ordem") or 0)
    if not prateleira:
        return api_error("Informe a prateleira de destino.", 400)
    with get_db() as db:
        loc = db.execute("SELECT * FROM localizacoes WHERE id = ? AND ativo = 1", (loc_id,)).fetchone()
        if not loc:
            return api_error("Localização não encontrada.", 404)
        pr = db.execute("SELECT id FROM prateleiras WHERE armario = ? AND codigo = ? AND ativo = 1", (armario, prateleira)).fetchone()
        if not pr:
            return api_error("Prateleira de destino inválida.", 400)
        codigo = _unique_location_code(db, armario, prateleira, loc["nome"], loc_id)
        db.execute(
            "UPDATE localizacoes SET codigo = ?, armario = ?, prateleira = ?, ordem = ? WHERE id = ?",
            (codigo, armario, prateleira, ordem, loc_id),
        )
        audit(db, current_user_id(), "mover", "localizacao", loc_id, f"{loc['codigo']} -> {codigo}")
        db.commit()
        return api_ok({"codigo": codigo}, "Localização movida.")


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
