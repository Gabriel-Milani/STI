from .auth_utils import current_user_id, current_user_name
from .helpers import audit
from .unidades import (
    attach_units_to_mov,
    change_units_status,
    create_units,
    is_unit_product,
    selected_available_units,
    sync_product_quantity,
)


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


def normalize_unit_codes(value):
    if value is None:
        return []
    if isinstance(value, str):
        raw = value.replace(";", ",").split(",")
    elif isinstance(value, (list, tuple, set)):
        raw = value
    else:
        raw = [value]
    codes = []
    for item in raw:
        code = str(item or "").strip()
        if code and code not in codes:
            codes.append(code)
    return codes


def apply_stock_change(db, produto, tipo, qtd, data=None):
    data = data or {}
    antes = produto["quantidade_atual"]
    unidades = []
    if tipo == "entrada":
        if is_unit_product(produto):
            unidades = create_units(db, produto, qtd, data.get("observacao"))
            depois = sync_product_quantity(db, produto["id"])
        else:
            depois = antes + qtd
            db.execute("UPDATE produtos SET quantidade_atual = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?", (depois, produto["id"]))
        return antes, depois, unidades

    if qtd > antes:
        labels = {
            "retirada": "essa retirada",
            "descarte": "esse descarte",
            "emprestimo": "esse empréstimo",
        }
        raise StockError(f"Não há estoque suficiente para {labels.get(tipo, 'essa movimentação')}.", 409)

    if is_unit_product(produto):
        codigos = normalize_unit_codes(data.get("unidades_codigos") or data.get("unidades"))
        if not codigos:
            raise StockError("Selecione as unidades que serão movimentadas.", 400)
        if len(codigos) != qtd:
            raise StockError("A quantidade deve bater com as unidades selecionadas.", 400)
        selecionadas = selected_available_units(db, produto["id"], codigos)
        if len(selecionadas) != len(codigos):
            raise StockError("Uma ou mais unidades selecionadas não pertencem a este produto.", 400)
        indisponiveis = [unit["codigo_unidade"] for unit in selecionadas if unit["status"] != "disponivel"]
        if indisponiveis:
            raise StockError(f"Unidade indisponível: {', '.join(indisponiveis)}.", 409)
        status = {"retirada": "retirado", "descarte": "descartado", "emprestimo": "emprestado"}[tipo]
        unidades = change_units_status(db, selecionadas, status)
        depois = sync_product_quantity(db, produto["id"])
    else:
        depois = antes - qtd
        db.execute("UPDATE produtos SET quantidade_atual = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?", (depois, produto["id"]))
    return antes, depois, unidades


def register_product_movement(db, produto_id, tipo, qtd, data):
    produto = get_product(db, produto_id)
    antes, depois, unidades = apply_stock_change(db, produto, tipo, qtd, data)
    mov_id = create_mov(db, produto, tipo, qtd, antes, depois, data, unidades)
    signal = "+" if tipo == "entrada" else "-"
    audit(db, current_user_id(), tipo, "produto", produto["id"], f"{signal}{qtd}")
    return produto, mov_id, depois, unidades
