from flask import Blueprint
import re
from ..database import get_db, row_to_dict, rows_to_list
from ..services.auth_utils import login_required
from ..services.helpers import api_ok, api_error, location_label

scanner_bp = Blueprint("scanner", __name__)


@scanner_bp.get("/buscar/<codigo>")
@login_required
def buscar(codigo):
    codigo = re.sub(r"\s+", "", codigo or "").strip().upper()
    with get_db() as db:
        unidade = db.execute(
            """
            SELECT u.*, p.nome AS produto_nome, p.codigo AS produto_codigo, p.codigo_barras, p.tipo_controle,
                   l.codigo AS localizacao_codigo, l.nome AS localizacao_nome, l.armario, l.prateleira
            FROM produto_unidades u
            JOIN produtos p ON p.id = u.produto_id
            JOIN localizacoes l ON l.id = u.localizacao_id
            WHERE p.ativo = 1 AND UPPER(u.codigo_unidade) = ?
            """,
            (codigo,),
        ).fetchone()
        if unidade:
            data = row_to_dict(unidade)
            data["localizacao_label"] = location_label({
                "armario": data["armario"],
                "prateleira": data["prateleira"],
                "nome": data["localizacao_nome"],
            })
            return api_ok({"tipo": "unidade", "unidade": data})

        produto = db.execute(
            "SELECT * FROM produtos WHERE ativo = 1 AND (UPPER(codigo) = ? OR UPPER(codigo_barras) = ?)",
            (codigo, codigo),
        ).fetchone()
        if produto:
            loc = db.execute("SELECT * FROM localizacoes WHERE id = ?", (produto["localizacao_id"],)).fetchone()
            p = row_to_dict(produto)
            p["localizacao"] = row_to_dict(loc)
            p["localizacao_label"] = location_label(loc)
            return api_ok({"tipo": "produto", "produto": p})

        loc = db.execute("SELECT * FROM localizacoes WHERE ativo = 1 AND UPPER(codigo) = ?", (codigo,)).fetchone()
        if loc:
            produtos = db.execute(
                "SELECT id, codigo, nome, quantidade_atual, estoque_minimo FROM produtos WHERE localizacao_id = ? AND ativo = 1 ORDER BY nome",
                (loc["id"],),
            ).fetchall()
            return api_ok({"tipo": "localizacao", "localizacao": row_to_dict(loc), "produtos": rows_to_list(produtos)})

        return api_error("Código não encontrado.", 404)
