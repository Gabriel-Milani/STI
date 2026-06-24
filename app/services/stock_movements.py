from .auth_utils import current_user_id, current_user_name
from .helpers import audit


class StockError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


def actor_name():
    return current_user_name() or "Usuário logado"


def get_product(db, produto_id):
    produto = db.execute("SELECT * FROM produtos WHERE id = ? AND ativo = 1", (produto_id,)).fetchone()
    if not produto:
        raise StockError("Produto não encontrado.", 404)
    return produto


def create_mov(db, produto, tipo, qtd, antes, depois, data):
    origem = data.get("responsavel_origem") or data.get("entregue_por") or data.get("recebido_por") or data.get("descartado_por")
    if not origem and tipo in ("entrada", "retirada", "emprestimo", "descarte"):
        origem = actor_name()
    cur = db.execute(
        """
        INSERT INTO movimentacoes
        (produto_id, tipo, quantidade, quantidade_antes, quantidade_depois,
         responsavel_origem, responsavel_destino, destino, motivo, observacao,
         localizacao_origem_id, localizacao_destino_id, usuario_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            produto["localizacao_id"],
            produto["localizacao_id"],
            current_user_id(),
        ),
    )
    return cur.lastrowid


def apply_stock_change(db, produto, tipo, qtd, data=None):
    data = data or {}
    antes = produto["quantidade_atual"]
    if tipo == "entrada":
        depois = antes + qtd
        db.execute("UPDATE produtos SET quantidade_atual = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?", (depois, produto["id"]))
        return antes, depois

    if qtd > antes:
        labels = {
            "retirada": "essa retirada",
            "descarte": "esse descarte",
            "emprestimo": "esse empréstimo",
        }
        raise StockError(f"Não há estoque suficiente para {labels.get(tipo, 'essa movimentação')}.", 409)

    depois = antes - qtd
    db.execute("UPDATE produtos SET quantidade_atual = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?", (depois, produto["id"]))
    return antes, depois


def register_product_movement(db, produto_id, tipo, qtd, data):
    produto = get_product(db, produto_id)
    antes, depois = apply_stock_change(db, produto, tipo, qtd, data)
    mov_id = create_mov(db, produto, tipo, qtd, antes, depois, data)
    signal = "+" if tipo == "entrada" else "-"
    audit(db, current_user_id(), tipo, "produto", produto["id"], f"{signal}{qtd}")
    return produto, mov_id, depois
