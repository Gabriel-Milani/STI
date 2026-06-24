from flask import Blueprint
import re
from ..database import get_db, row_to_dict
from ..services.auth_utils import login_required
from ..services.helpers import api_ok, api_error, location_label

scanner_bp = Blueprint("scanner", __name__)


@scanner_bp.get("/buscar/<codigo>")
@login_required
def buscar(codigo):
    codigo = re.sub(r"\s+", "", codigo or "").strip().upper()
    with get_db() as db:
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

        return api_error("Código não encontrado.", 404)
