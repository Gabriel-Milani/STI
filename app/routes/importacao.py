from flask import Blueprint, request
from openpyxl import load_workbook
from ..database import get_db
from ..services.auth_utils import login_required, current_user_id, current_user_name
from ..services.helpers import api_ok, api_error, generate_product_code, generate_barcode, parse_int, audit
from ..services.unit_control import create_units, record_movement_units, sync_unit_stock

importacao_bp = Blueprint("importacao", __name__)

REQUIRED_HEADERS = [
    "nome", "categoria", "marca", "modelo", "codigo_barras",
    "quantidade_inicial", "estoque_minimo", "localizacao_codigo", "observacao"
]
OPTIONAL_HEADERS = ["tipo_controle", "prefixo_rastreio"]
EXPECTED_HEADERS = REQUIRED_HEADERS + OPTIONAL_HEADERS


@importacao_bp.get("/template")
@login_required
def template_info():
    return api_ok({"headers": EXPECTED_HEADERS})


@importacao_bp.post("/produtos")
@login_required
def importar_produtos():
    if "arquivo" not in request.files:
        return api_error("Envie um arquivo Excel no campo 'arquivo'.", 400)
    file = request.files["arquivo"]
    try:
        wb = load_workbook(file, data_only=True)
        ws = wb.active
    except Exception:
        return api_error("Arquivo Excel inválido.", 400)

    headers = [str(c.value).strip() if c.value else "" for c in ws[1]]
    missing = [h for h in REQUIRED_HEADERS if h not in headers]
    if missing:
        return api_error("Cabeçalhos ausentes na planilha.", 400, missing)
    idx = {h: headers.index(h) for h in EXPECTED_HEADERS if h in headers}

    criados = 0
    erros = []
    with get_db() as db:
        for row_num, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
            data = {h: row[idx[h]] if h in idx and idx[h] < len(row) else None for h in EXPECTED_HEADERS}
            nome = str(data.get("nome") or "").strip()
            if not nome:
                continue
            loc_codigo = str(data.get("localizacao_codigo") or "").strip().upper()
            loc = db.execute("SELECT id FROM localizacoes WHERE codigo = ? AND ativo = 1", (loc_codigo,)).fetchone()
            if not loc:
                erros.append({"linha": row_num, "erro": "Localização inválida", "localizacao_codigo": loc_codigo})
                continue
            qtd = parse_int(data.get("quantidade_inicial"))
            minimo = parse_int(data.get("estoque_minimo"))
            if qtd < 0 or minimo < 0:
                erros.append({"linha": row_num, "erro": "Quantidade ou mínimo negativo"})
                continue
            tipo_controle = str(data.get("tipo_controle") or "quantidade").strip().lower()
            if tipo_controle not in ("quantidade", "unidade"):
                erros.append({"linha": row_num, "erro": "Tipo de controle inválido"})
                continue
            prefixo_rastreio = str(data.get("prefixo_rastreio") or "").strip() or None
            if tipo_controle == "unidade" and not prefixo_rastreio:
                erros.append({"linha": row_num, "erro": "Prefixo de rastreio obrigatório para produto por unidade"})
                continue
            codigo_barras = str(data.get("codigo_barras") or "").strip() or generate_barcode(db)
            try:
                codigo = generate_product_code(nome)
                cur = db.execute(
                    """
                    INSERT INTO produtos
                    (codigo, nome, categoria, marca, modelo, codigo_barras, quantidade_atual, estoque_minimo, tipo_controle, prefixo_rastreio, localizacao_id, observacao, ativo)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                    """,
                    (codigo, nome, data.get("categoria"), data.get("marca"), data.get("modelo"), codigo_barras, 0 if tipo_controle == "unidade" else qtd, minimo, tipo_controle, prefixo_rastreio, loc["id"], data.get("observacao")),
                )
                produto_id = cur.lastrowid
                unidades_codigos = None
                if tipo_controle == "unidade" and qtd > 0:
                    produto = db.execute("SELECT * FROM produtos WHERE id = ?", (produto_id,)).fetchone()
                    unidades_codigos = create_units(db, produto, qtd, "Importação inicial")
                    sync_unit_stock(db, produto_id)
                if qtd > 0:
                    mov_cur = db.execute(
                        """
                        INSERT INTO movimentacoes
                        (produto_id, tipo, quantidade, quantidade_antes, quantidade_depois, responsavel_origem, observacao, unidades_codigos, localizacao_destino_id, usuario_id)
                        VALUES (?, 'entrada', ?, 0, ?, ?, 'Importação inicial', ?, ?, ?)
                        """,
                        (produto_id, qtd, qtd, current_user_name(), ",".join(unidades_codigos) if unidades_codigos else None, loc["id"], current_user_id()),
                    )
                    record_movement_units(db, mov_cur.lastrowid, unidades_codigos, "disponivel")
                audit(db, current_user_id(), "importar", "produto", produto_id, codigo)
                criados += 1
            except Exception as exc:
                erros.append({"linha": row_num, "erro": "Falha ao inserir. Código de barras, código de unidade ou prefixo duplicado?"})
        db.commit()
    return api_ok({"criados": criados, "erros": erros}, "Importação finalizada.")
