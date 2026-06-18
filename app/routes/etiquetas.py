from flask import Blueprint, send_file
from io import BytesIO
import qrcode
from ..database import get_db
from ..services.auth_utils import login_required
from ..services.helpers import api_error

etiquetas_bp = Blueprint("etiquetas", __name__)


def qr_png(data: str):
    img = qrcode.make(data)
    buf = BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf


@etiquetas_bp.get("/produto/<int:produto_id>/qr.png")
@login_required
def produto_qr(produto_id):
    with get_db() as db:
        p = db.execute("SELECT codigo FROM produtos WHERE id = ? AND ativo = 1", (produto_id,)).fetchone()
        if not p:
            return api_error("Produto não encontrado.", 404)
        return send_file(qr_png(p["codigo"]), mimetype="image/png", download_name=f"{p['codigo']}.png")


@etiquetas_bp.get("/localizacao/<codigo>/qr.png")
@login_required
def localizacao_qr(codigo):
    with get_db() as db:
        l = db.execute("SELECT codigo FROM localizacoes WHERE codigo = ? AND ativo = 1", (codigo,)).fetchone()
        if not l:
            return api_error("Localização não encontrada.", 404)
        return send_file(qr_png(l["codigo"]), mimetype="image/png", download_name=f"{l['codigo']}.png")
