from flask import Blueprint, request
from openpyxl import load_workbook
from ..database import get_db
from ..services.auth_utils import login_required, current_user_id, current_user_name
from ..services.helpers import api_ok, api_error, generate_product_code, generate_barcode, parse_int, audit
from ..services.stock_movements import create_mov

importacao_bp = Blueprint("importacao", __name__)

EXPECTED_HEADERS = [
    "nome", "categoria", "modelo", "codigo_barras",
    "quantidade_inicial", "estoque_minimo", "localizacao_codigo", "observacao"
]


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
    missing = [h for h in EXPECTED_HEADERS if h not in headers]
    if missing:
        return api_error("Cabeçalhos ausentes na planilha.", 400, missing)
    idx = {h: headers.index(h) for h in EXPECTED_HEADERS}

    criados = 0
    erros = []
    with get_db() as db:
        for row_num, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
            data = {h: row[idx[h]] for h in EXPECTED_HEADERS}
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
            codigo_barras = str(data.get("codigo_barras") or "").strip() or generate_barcode(db)
            try:
                codigo = generate_product_code(db=db)
                cur = db.execute(
                    """
                    INSERT INTO produtos
                    (codigo, nome, categoria, modelo, codigo_barras, quantidade_atual, estoque_minimo, localizacao_id, observacao, ativo)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                    """,
                    (codigo, nome, data.get("categoria"), data.get("modelo"), codigo_barras, qtd, minimo, loc["id"], data.get("observacao")),
                )
                if qtd > 0:
                    produto = db.execute("SELECT * FROM produtos WHERE id = ?", (cur.lastrowid,)).fetchone()
                    create_mov(
                        db,
                        produto,
                        "entrada",
                        qtd,
                        0,
                        qtd,
                        {"recebido_por": current_user_name(), "observacao": "Importação inicial"},
                    )
                audit(db, current_user_id(), "importar", "produto", cur.lastrowid, codigo)
                criados += 1
            except Exception:
                erros.append({"linha": row_num, "erro": "Falha ao inserir. Código de barras duplicado?"})
        db.commit()
    return api_ok({"criados": criados, "erros": erros}, "Importação finalizada.")
