from sqlite3 import IntegrityError

from .helpers import audit, generate_barcode, generate_product_code, parse_int
from .stock_movements import create_mov
from .unidades import create_units, sync_product_quantity


class ProductValidationError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


class ProductCreateError(Exception):
    def __init__(self, message="Não foi possível cadastrar. Verifique código interno/código de barras duplicado."):
        super().__init__(message)
        self.message = message


def normalize_product_payload(data):
    nome = (data.get("nome") or "").strip()
    if not nome:
        raise ProductValidationError("Informe o nome do produto.")

    quantidade = parse_int(data.get("quantidade_inicial", data.get("quantidade_atual", 0)))
    minimo = parse_int(data.get("estoque_minimo", 0))
    tipo_controle = data.get("tipo_controle") or "quantidade"
    prefixo_rastreio = (data.get("prefixo_rastreio") or "").strip() or None

    if tipo_controle not in ("quantidade", "unidade"):
        raise ProductValidationError("Tipo de controle inválido.")
    if tipo_controle == "unidade" and not prefixo_rastreio:
        raise ProductValidationError("Informe o prefixo de rastreio.")
    if quantidade < 0:
        raise ProductValidationError("Quantidade inicial não pode ser negativa.")
    if minimo < 0:
        raise ProductValidationError("Estoque mínimo não pode ser negativo.")

    return {
        "nome": nome,
        "categoria": data.get("categoria"),
        "modelo": data.get("modelo"),
        "codigo": str(data.get("codigo") or "").strip() or None,
        "codigo_barras": str(data.get("codigo_barras") or "").strip() or None,
        "quantidade": quantidade,
        "estoque_minimo": minimo,
        "tipo_controle": tipo_controle,
        "prefixo_rastreio": prefixo_rastreio,
        "localizacao_id": data.get("localizacao_id"),
        "localizacao_codigo": (str(data.get("localizacao_codigo") or "").strip().upper() or None),
        "observacao": data.get("observacao"),
        "recebido_por": data.get("recebido_por") or data.get("operador"),
    }


def get_active_location(db, payload):
    if payload["localizacao_id"]:
        return db.execute(
            "SELECT * FROM localizacoes WHERE id = ? AND ativo = 1",
            (payload["localizacao_id"],),
        ).fetchone()
    if payload["localizacao_codigo"]:
        return db.execute(
            "SELECT * FROM localizacoes WHERE codigo = ? AND ativo = 1",
            (payload["localizacao_codigo"],),
        ).fetchone()
    return None


def create_product(db, data, usuario_id=None, audit_action="criar", initial_note="Quantidade inicial"):
    payload = normalize_product_payload(data)
    loc = get_active_location(db, payload)
    if not loc:
        raise ProductValidationError("Escolha uma localização para o produto.")

    codigo = payload["codigo"] or generate_product_code(db=db)
    codigo_barras = payload["codigo_barras"] or generate_barcode(db)
    quantidade = payload["quantidade"]
    tipo_controle = payload["tipo_controle"]

    try:
        cur = db.execute(
            """
            INSERT INTO produtos
            (codigo, nome, categoria, modelo, codigo_barras, quantidade_atual, estoque_minimo,
             tipo_controle, prefixo_rastreio, localizacao_id, observacao, ativo)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            """,
            (
                codigo,
                payload["nome"],
                payload["categoria"],
                payload["modelo"],
                codigo_barras,
                0 if tipo_controle == "unidade" else quantidade,
                payload["estoque_minimo"],
                tipo_controle,
                payload["prefixo_rastreio"],
                loc["id"],
                payload["observacao"],
            ),
        )
        produto_id = cur.lastrowid
        produto = db.execute("SELECT * FROM produtos WHERE id = ?", (produto_id,)).fetchone()
        unidades = []

        if tipo_controle == "unidade" and quantidade > 0:
            unidades = create_units(db, produto, quantidade, initial_note)
            quantidade_depois = sync_product_quantity(db, produto_id)
        else:
            quantidade_depois = quantidade

        if quantidade > 0:
            create_mov(
                db,
                produto,
                "entrada",
                quantidade,
                0,
                quantidade_depois,
                {"recebido_por": payload["recebido_por"], "observacao": initial_note},
                unidades,
            )

        audit(db, usuario_id, audit_action, "produto", produto_id, codigo)
        return {"id": produto_id, "codigo": codigo}
    except IntegrityError as exc:
        raise ProductCreateError() from exc
