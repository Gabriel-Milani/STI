import re
import unicodedata
from flask import jsonify
from ..database import get_db


def api_ok(data=None, message=None, status=200):
    payload = {"ok": True}
    if message:
        payload["message"] = message
    if data is not None:
        payload["data"] = data
    return jsonify(payload), status


def api_error(message, status=400, details=None):
    payload = {"ok": False, "error": message}
    if details:
        payload["details"] = details
    return jsonify(payload), status


def slugify(text):
    text = text or "PRODUTO"
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^A-Za-z0-9]+", "-", text).strip("-").upper()
    return text[:35] or "PRODUTO"


def generate_product_code(nome):
    base = slugify(nome)
    with get_db() as db:
        seq = db.execute("SELECT COUNT(*) AS c FROM produtos").fetchone()["c"] + 1
        candidate = f"PROD-{seq:05d}-{base[:16]}"
        while db.execute("SELECT id FROM produtos WHERE codigo = ?", (candidate,)).fetchone():
            seq += 1
            candidate = f"PROD-{seq:05d}-{base[:16]}"
        return candidate


def generate_barcode(db):
    row = db.execute("SELECT last_value FROM codigo_barras_sequence WHERE id = 1").fetchone()
    if not row:
        db.execute("INSERT INTO codigo_barras_sequence (id, last_value) VALUES (1, 0)")
        last_value = 0
    else:
        last_value = row["last_value"]

    while True:
        last_value += 1
        if last_value > 9999999:
            raise ValueError("Limite de códigos de barras automáticos atingido.")
        codigo = f"P{last_value:07d}"
        db.execute("UPDATE codigo_barras_sequence SET last_value = ? WHERE id = 1", (last_value,))
        if not db.execute("SELECT id FROM produtos WHERE codigo_barras = ?", (codigo,)).fetchone():
            return codigo


def require_fields(payload, fields):
    missing = [f for f in fields if payload.get(f) in (None, "")]
    return missing


def parse_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def location_label(loc):
    if not loc:
        return None
    armario_label = loc["armario"].replace("ARM", "Armário ") if loc["armario"].startswith("ARM") else loc["armario"]
    return f"{armario_label} > {loc['prateleira']} > {loc['nome']}"


def audit(db, usuario_id, acao, entidade, entidade_id=None, detalhe=None):
    db.execute(
        "INSERT INTO audit_logs (usuario_id, acao, entidade, entidade_id, detalhe) VALUES (?, ?, ?, ?, ?)",
        (usuario_id, acao, entidade, entidade_id, detalhe),
    )
