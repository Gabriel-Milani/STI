from flask import Blueprint, request
from openpyxl import load_workbook
from ..database import get_db
from ..services.auth_utils import login_required, current_user_id, current_user_name
from ..services.helpers import api_ok, api_error
from ..services.products import ProductCreateError, ProductValidationError, create_product

importacao_bp = Blueprint("importacao", __name__)

EXPECTED_HEADERS = [
    "nome", "categoria", "modelo", "codigo_barras",
    "quantidade_inicial", "estoque_minimo", "localizacao_codigo", "observacao"
]
ALLOWED_EXTENSIONS = {".xlsx", ".xlsm"}


def allowed_excel_file(filename):
    name = (filename or "").lower()
    return any(name.endswith(ext) for ext in ALLOWED_EXTENSIONS)


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
    if not allowed_excel_file(file.filename):
        return api_error("Envie um arquivo Excel .xlsx ou .xlsm.", 400)
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
            data["recebido_por"] = current_user_name()
            try:
                create_product(
                    db,
                    data,
                    current_user_id(),
                    audit_action="importar",
                    initial_note="Importação inicial",
                )
                criados += 1
            except ProductValidationError as error:
                erros.append({"linha": row_num, "erro": error.message})
            except ProductCreateError as error:
                erros.append({"linha": row_num, "erro": error.message})
        db.commit()
    return api_ok({"criados": criados, "erros": erros}, "Importação finalizada.")
