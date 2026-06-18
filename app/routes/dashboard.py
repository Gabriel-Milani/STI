from flask import Blueprint
from ..database import get_db, rows_to_list
from ..services.auth_utils import login_required
from ..services.helpers import api_ok

_dashboard_bp = Blueprint("dashboard", __name__)

dashboard_bp = _dashboard_bp


@dashboard_bp.get("")
@login_required
def resumo():
    with get_db() as db:
        total_produtos = db.execute("SELECT COUNT(*) AS c FROM produtos WHERE ativo = 1").fetchone()["c"]
        unidades = db.execute("SELECT COALESCE(SUM(quantidade_atual),0) AS s FROM produtos WHERE ativo = 1").fetchone()["s"]
        baixo = db.execute("SELECT COUNT(*) AS c FROM produtos WHERE ativo = 1 AND quantidade_atual <= estoque_minimo").fetchone()["c"]
        zerados = db.execute("SELECT COUNT(*) AS c FROM produtos WHERE ativo = 1 AND quantidade_atual = 0").fetchone()["c"]
        emp_abertos = db.execute("SELECT COUNT(*) AS c FROM emprestimos WHERE status = 'aberto'").fetchone()["c"]
        ultimas = db.execute(
            """
            SELECT m.*, p.nome AS produto_nome, p.codigo AS produto_codigo
            FROM movimentacoes m
            JOIN produtos p ON p.id = m.produto_id
            ORDER BY m.data_hora DESC LIMIT 10
            """
        ).fetchall()
        criticos = db.execute(
            """
            SELECT p.id, p.codigo, p.nome, p.quantidade_atual, p.estoque_minimo, l.nome AS localizacao_nome, l.prateleira
            FROM produtos p
            JOIN localizacoes l ON l.id = p.localizacao_id
            WHERE p.ativo = 1 AND p.quantidade_atual <= p.estoque_minimo
            ORDER BY p.quantidade_atual ASC, p.nome
            LIMIT 20
            """
        ).fetchall()
        return api_ok({
            "resumo": {
                "total_produtos": total_produtos,
                "unidades_em_estoque": unidades,
                "produtos_abaixo_minimo": baixo,
                "produtos_zerados": zerados,
                "emprestimos_abertos": emp_abertos,
            },
            "ultimas_movimentacoes": rows_to_list(ultimas),
            "estoque_critico": rows_to_list(criticos),
        })
