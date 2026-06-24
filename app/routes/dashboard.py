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
        loc_ativas = db.execute("SELECT COUNT(*) AS c FROM localizacoes WHERE ativo = 1").fetchone()["c"]
        ultimas = db.execute(
            """
            SELECT m.*, p.nome AS produto_nome, p.codigo AS produto_codigo, u.nome AS usuario_nome, u.username AS usuario_username
            FROM movimentacoes m
            JOIN produtos p ON p.id = m.produto_id
            LEFT JOIN usuarios u ON u.id = m.usuario_id
            ORDER BY m.data_hora DESC LIMIT 10
            """
        ).fetchall()
        criticos = db.execute(
            """
            SELECT p.id, p.codigo, p.nome, p.modelo, p.categoria, p.quantidade_atual, p.estoque_minimo, l.nome AS localizacao_nome, l.armario, l.prateleira
            FROM produtos p
            JOIN localizacoes l ON l.id = p.localizacao_id
            WHERE p.ativo = 1 AND p.quantidade_atual <= p.estoque_minimo
            ORDER BY p.quantidade_atual ASC, p.nome
            LIMIT 5
            """
        ).fetchall()
        semana = db.execute(
            """
            SELECT DATE(data_hora) AS dia, tipo, COALESCE(SUM(quantidade), 0) AS total
            FROM movimentacoes
            WHERE DATE(data_hora) >= DATE('now', '-6 days')
            GROUP BY DATE(data_hora), tipo
            ORDER BY dia
            """
        ).fetchall()
        localizacoes = db.execute(
            """
            SELECT l.codigo, l.nome, l.armario, l.prateleira,
                   COALESCE(p.produtos_count, 0) AS produtos_count,
                   COALESCE(p.unidades_total, 0) AS unidades_total,
                   COALESCE(m.movimentacoes_count, 0) AS movimentacoes_count
            FROM localizacoes l
            LEFT JOIN (
                SELECT localizacao_id, COUNT(*) AS produtos_count, COALESCE(SUM(quantidade_atual), 0) AS unidades_total
                FROM produtos
                WHERE ativo = 1
                GROUP BY localizacao_id
            ) p ON p.localizacao_id = l.id
            LEFT JOIN (
                SELECT localizacao_id, COUNT(*) AS movimentacoes_count
                FROM (
                    SELECT localizacao_destino_id AS localizacao_id FROM movimentacoes WHERE localizacao_destino_id IS NOT NULL
                    UNION ALL
                    SELECT localizacao_origem_id AS localizacao_id FROM movimentacoes WHERE localizacao_origem_id IS NOT NULL
                )
                GROUP BY localizacao_id
            ) m ON m.localizacao_id = l.id
            WHERE l.ativo = 1
            ORDER BY movimentacoes_count DESC, unidades_total DESC, l.armario, l.prateleira
            LIMIT 4
            """
        ).fetchall()
        mapa = db.execute(
            """
            SELECT l.armario,
                   COUNT(DISTINCT l.id) AS localizacoes_count,
                   COUNT(DISTINCT p.id) AS produtos_count,
                   COALESCE(SUM(p.quantidade_atual), 0) AS unidades_total
            FROM localizacoes l
            LEFT JOIN produtos p ON p.localizacao_id = l.id AND p.ativo = 1
            WHERE l.ativo = 1
            GROUP BY l.armario
            ORDER BY l.armario
            LIMIT 4
            """
        ).fetchall()
        return api_ok({
            "resumo": {
                "total_produtos": total_produtos,
                "unidades_em_estoque": unidades,
                "localizacoes_ativas": loc_ativas,
                "produtos_abaixo_minimo": baixo,
                "produtos_zerados": zerados,
                "emprestimos_abertos": emp_abertos,
            },
            "ultimas_movimentacoes": rows_to_list(ultimas),
            "estoque_critico": rows_to_list(criticos),
            "movimentacoes_semana": rows_to_list(semana),
            "localizacoes_mais_usadas": rows_to_list(localizacoes),
            "mapa_operacional": rows_to_list(mapa),
        })
