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


def format_product_code(number):
    return f"P{number:05d}"


def product_code_number(code):
    value = (code or "").strip().upper()
    return int(value[1:]) if len(value) == 6 and value[0] == "P" and value[1:].isdigit() else None


def generate_product_code(nome=None, db=None):
    close_after = db is None
    db = db or get_db()
    try:
        db.execute("""
            CREATE TABLE IF NOT EXISTS produto_codigo_sequence (
                id INTEGER PRIMARY KEY CHECK(id = 1),
                last_value INTEGER NOT NULL DEFAULT 0
            )
        """)
        row = db.execute("SELECT last_value FROM produto_codigo_sequence WHERE id = 1").fetchone()
        if not row:
            last_number = 0
            rows = db.execute("SELECT codigo FROM produtos WHERE codigo LIKE 'P_____'").fetchall()
            for row in rows:
                number = product_code_number(row["codigo"])
                if number:
                    last_number = max(last_number, number)
            db.execute("INSERT INTO produto_codigo_sequence (id, last_value) VALUES (1, ?)", (last_number,))
        else:
            last_number = row["last_value"]

        next_number = last_number + 1
        while True:
            candidate = format_product_code(next_number)
            db.execute("UPDATE produto_codigo_sequence SET last_value = ? WHERE id = 1", (next_number,))
            exists = db.execute("SELECT id FROM produtos WHERE codigo = ?", (candidate,)).fetchone()
            if not exists:
                if close_after:
                    db.commit()
                return candidate
            next_number += 1
    finally:
        if close_after:
            db.close()


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
