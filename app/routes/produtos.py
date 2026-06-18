from flask import Blueprint, request
from ..database import get_db, rows_to_list, row_to_dict
from ..services.auth_utils import login_required, current_user_id
from ..services.helpers import api_ok, api_error, generate_product_code, parse_int, audit, location_label

produtos_bp = Blueprint("produtos", __name__)


def produto_payload(row, loc=None):
    data = row_to_dict(row)
    if loc:
        data["localizacao"] = row_to_dict(loc)
        data["localizacao_label"] = location_label(loc)
    data["status"] = "baixo" if data["quantidade_atual"] <= data["estoque_minimo"] and data["quantidade_atual"] > 0 else "ok"
    if data["quantidade_atual"] == 0:
        data["status"] = "zerado"
    return data


@produtos_bp.get("")
@login_required
def listar():
    q = request.args.get("q", "").strip()
    localizacao = request.args.get("localizacao")
    baixo = request.args.get("baixo") == "1"
    params = []
    where = ["p.ativo = 1"]
    if q:
        where.append("(p.nome LIKE ? OR p.codigo LIKE ? OR p.codigo_barras LIKE ? OR p.marca LIKE ?)")
        like = f"%{q}%"
        params += [like, like, like, like]
    if localizacao:
        where.append("l.codigo = ?")
        params.append(localizacao)
    if baixo:
        where.append("p.quantidade_atual <= p.estoque_minimo")

    sql = f"""
        SELECT p.*, l.codigo AS localizacao_codigo, l.nome AS localizacao_nome, l.armario, l.prateleira
        FROM produtos p
        JOIN localizacoes l ON l.id = p.localizacao_id
        WHERE {' AND '.join(where)}
        ORDER BY p.nome
    """
    with get_db() as db:
        rows = rows_to_list(db.execute(sql, params).fetchall())
        for r in rows:
            r["localizacao_label"] = f"{r['armario']} > {r['prateleira']} > {r['localizacao_nome']}"
            if r["quantidade_atual"] == 0:
                r["status"] = "zerado"
            elif r["quantidade_atual"] <= r["estoque_minimo"]:
                r["status"] = "baixo"
            else:
                r["status"] = "ok"
        return api_ok({"produtos": rows})


@produtos_bp.post("")
@login_required
def criar():
    data = request.get_json(silent=True) or {}
    nome = (data.get("nome") or "").strip()
    if not nome:
        return api_error("Informe o nome do produto.", 400)
    loc_id = data.get("localizacao_id")
    loc_codigo = data.get("localizacao_codigo")
    quantidade = parse_int(data.get("quantidade_inicial", data.get("quantidade_atual", 0)))
    minimo = parse_int(data.get("estoque_minimo", 0))
    if quantidade < 0:
        return api_error("Quantidade inicial não pode ser negativa.", 400)
    if minimo < 0:
        return api_error("Estoque mínimo não pode ser negativo.", 400)

    with get_db() as db:
        if loc_id:
            loc = db.execute("SELECT * FROM localizacoes WHERE id = ? AND ativo = 1", (loc_id,)).fetchone()
        elif loc_codigo:
            loc = db.execute("SELECT * FROM localizacoes WHERE codigo = ? AND ativo = 1", (loc_codigo,)).fetchone()
        else:
            loc = None
        if not loc:
            return api_error("Escolha uma localização para o produto.", 400)

        codigo = data.get("codigo") or generate_product_code(nome)
        codigo_barras = (data.get("codigo_barras") or "").strip() or None
        try:
            cur = db.execute(
                """
                INSERT INTO produtos
                (codigo, nome, categoria, marca, modelo, codigo_barras, quantidade_atual, estoque_minimo, localizacao_id, observacao, ativo)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                """,
                (
                    codigo,
                    nome,
                    data.get("categoria"),
                    data.get("marca"),
                    data.get("modelo"),
                    codigo_barras,
                    quantidade,
                    minimo,
                    loc["id"],
                    data.get("observacao"),
                ),
            )
            produto_id = cur.lastrowid
            if quantidade > 0:
                db.execute(
                    """
                    INSERT INTO movimentacoes
                    (produto_id, tipo, quantidade, quantidade_antes, quantidade_depois, responsavel_origem, observacao, localizacao_destino_id, usuario_id)
                    VALUES (?, 'entrada', ?, 0, ?, ?, ?, ?, ?)
                    """,
                    (produto_id, quantidade, quantidade, data.get("recebido_por") or data.get("operador"), "Quantidade inicial", loc["id"], current_user_id()),
                )
            audit(db, current_user_id(), "criar", "produto", produto_id, codigo)
            db.commit()
            return api_ok({"id": produto_id, "codigo": codigo}, "Produto cadastrado.", 201)
        except Exception:
            return api_error("Não foi possível cadastrar. Verifique código interno/código de barras duplicado.", 400)


@produtos_bp.get("/<codigo_ou_id>")
@login_required
def detalhe(codigo_ou_id):
    with get_db() as db:
        if str(codigo_ou_id).isdigit():
            produto = db.execute("SELECT * FROM produtos WHERE id = ? AND ativo = 1", (codigo_ou_id,)).fetchone()
        else:
            produto = db.execute("SELECT * FROM produtos WHERE codigo = ? AND ativo = 1", (codigo_ou_id,)).fetchone()
        if not produto:
            return api_error("Produto não encontrado.", 404)
        loc = db.execute("SELECT * FROM localizacoes WHERE id = ?", (produto["localizacao_id"],)).fetchone()
        movs = db.execute(
            "SELECT * FROM movimentacoes WHERE produto_id = ? ORDER BY data_hora DESC LIMIT 20",
            (produto["id"],),
        ).fetchall()
        emp = db.execute(
            "SELECT * FROM emprestimos WHERE produto_id = ? AND status = 'aberto' ORDER BY data_emprestimo DESC",
            (produto["id"],),
        ).fetchall()
        return api_ok({"produto": produto_payload(produto, loc), "movimentacoes": rows_to_list(movs), "emprestimos_abertos": rows_to_list(emp)})


@produtos_bp.put("/<int:produto_id>")
@login_required
def atualizar(produto_id):
    data = request.get_json(silent=True) or {}
    with get_db() as db:
        produto = db.execute("SELECT * FROM produtos WHERE id = ? AND ativo = 1", (produto_id,)).fetchone()
        if not produto:
            return api_error("Produto não encontrado.", 404)
        nome = (data.get("nome", produto["nome"]) or "").strip()
        if not nome:
            return api_error("Informe o nome do produto.", 400)
        minimo = parse_int(data.get("estoque_minimo", produto["estoque_minimo"]))
        if minimo < 0:
            return api_error("Estoque mínimo não pode ser negativo.", 400)
        codigo_barras = (data.get("codigo_barras", produto["codigo_barras"]) or "").strip() or None
        try:
            db.execute(
                """
                UPDATE produtos
                SET nome=?, categoria=?, marca=?, modelo=?, codigo_barras=?, estoque_minimo=?, observacao=?, atualizado_em=CURRENT_TIMESTAMP
                WHERE id=?
                """,
                (nome, data.get("categoria", produto["categoria"]), data.get("marca", produto["marca"]), data.get("modelo", produto["modelo"]), codigo_barras, minimo, data.get("observacao", produto["observacao"]), produto_id),
            )
            audit(db, current_user_id(), "editar", "produto", produto_id, produto["codigo"])
            db.commit()
            return api_ok(message="Produto atualizado.")
        except Exception:
            return api_error("Não foi possível atualizar. Verifique código de barras duplicado.", 400)


@produtos_bp.post("/<int:produto_id>/mover")
@login_required
def mover(produto_id):
    data = request.get_json(silent=True) or {}
    destino_codigo = data.get("localizacao_codigo")
    destino_id = data.get("localizacao_id")
    with get_db() as db:
        produto = db.execute("SELECT * FROM produtos WHERE id = ? AND ativo = 1", (produto_id,)).fetchone()
        if not produto:
            return api_error("Produto não encontrado.", 404)
        if destino_id:
            destino = db.execute("SELECT * FROM localizacoes WHERE id = ? AND ativo = 1", (destino_id,)).fetchone()
        elif destino_codigo:
            destino = db.execute("SELECT * FROM localizacoes WHERE codigo = ? AND ativo = 1", (destino_codigo,)).fetchone()
        else:
            destino = None
        if not destino:
            return api_error("Escolha uma localização de destino válida.", 400)
        origem_id = produto["localizacao_id"]
        if origem_id == destino["id"]:
            return api_error("O produto já está nessa localização.", 400)
        db.execute("UPDATE produtos SET localizacao_id = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?", (destino["id"], produto_id))
        db.execute(
            """
            INSERT INTO movimentacoes
            (produto_id, tipo, quantidade, quantidade_antes, quantidade_depois, observacao, localizacao_origem_id, localizacao_destino_id, usuario_id)
            VALUES (?, 'mover', 0, ?, ?, ?, ?, ?, ?)
            """,
            (produto_id, produto["quantidade_atual"], produto["quantidade_atual"], data.get("observacao"), origem_id, destino["id"], current_user_id()),
        )
        audit(db, current_user_id(), "mover", "produto", produto_id, f"{origem_id} -> {destino['id']}")
        db.commit()
        return api_ok(message="Produto movido.")


@produtos_bp.delete("/<int:produto_id>")
@login_required
def desativar(produto_id):
    with get_db() as db:
        produto = db.execute("SELECT * FROM produtos WHERE id = ? AND ativo = 1", (produto_id,)).fetchone()
        if not produto:
            return api_error("Produto não encontrado.", 404)
        if produto["quantidade_atual"] > 0:
            return api_error("Não desative produto com estoque. Faça descarte ou ajuste antes.", 409)
        db.execute("UPDATE produtos SET ativo = 0, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?", (produto_id,))
        audit(db, current_user_id(), "desativar", "produto", produto_id, produto["codigo"])
        db.commit()
        return api_ok(message="Produto desativado.")
