import re


def is_unit_product(produto):
    return (produto["tipo_controle"] or "quantidade") == "unidade"


def available_count(db, produto_id):
    return db.execute(
        "SELECT COUNT(*) AS total FROM produto_unidades WHERE produto_id = ? AND status = 'disponivel'",
        (produto_id,),
    ).fetchone()["total"]


def sync_product_quantity(db, produto_id):
    total = available_count(db, produto_id)
    db.execute(
        "UPDATE produtos SET quantidade_atual = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?",
        (total, produto_id),
    )
    return total


def next_unit_numbers(db, produto_id, prefixo, quantidade):
    rows = db.execute(
        "SELECT codigo_unidade FROM produto_unidades WHERE produto_id = ?",
        (produto_id,),
    ).fetchall()
    pattern = re.compile(rf"^{re.escape(prefixo)}-(\d+)$")
    maior = 0
    for row in rows:
        match = pattern.match(row["codigo_unidade"] or "")
        if match:
            maior = max(maior, int(match.group(1)))
    return range(maior + 1, maior + quantidade + 1)


def create_units(db, produto, quantidade, observacao=None):
    prefixo = (produto["prefixo_rastreio"] or "").strip()
    if not prefixo:
        raise ValueError("Informe o prefixo de rastreio para produto por unidade.")
    created = []
    for number in next_unit_numbers(db, produto["id"], prefixo, quantidade):
        codigo = f"{prefixo}-{number}"
        cur = db.execute(
            """
            INSERT INTO produto_unidades (produto_id, codigo_unidade, status, localizacao_id, observacao)
            VALUES (?, ?, 'disponivel', ?, ?)
            """,
            (produto["id"], codigo, produto["localizacao_id"], observacao),
        )
        created.append({"id": cur.lastrowid, "codigo_unidade": codigo, "status_antes": None, "status_depois": "disponivel"})
    return created


def take_available_units(db, produto_id, quantidade):
    rows = db.execute(
        """
        SELECT * FROM produto_unidades
        WHERE produto_id = ? AND status = 'disponivel'
        ORDER BY id
        LIMIT ?
        """,
        (produto_id, quantidade),
    ).fetchall()
    if len(rows) < quantidade:
        return None
    return rows


def selected_available_units(db, produto_id, codigos):
    clean_codes = []
    for codigo in codigos or []:
        value = str(codigo or "").strip()
        if value and value not in clean_codes:
            clean_codes.append(value)
    if not clean_codes:
        return []

    placeholders = ",".join(["?"] * len(clean_codes))
    rows = db.execute(
        f"""
        SELECT * FROM produto_unidades
        WHERE produto_id = ? AND codigo_unidade IN ({placeholders})
        ORDER BY id
        """,
        [produto_id, *clean_codes],
    ).fetchall()
    by_code = {row["codigo_unidade"]: row for row in rows}
    return [by_code.get(codigo) for codigo in clean_codes if by_code.get(codigo)]


def change_units_status(db, units, status):
    changed = []
    for unit in units:
        db.execute("UPDATE produto_unidades SET status = ? WHERE id = ?", (status, unit["id"]))
        changed.append({
            "id": unit["id"],
            "codigo_unidade": unit["codigo_unidade"],
            "status_antes": unit["status"],
            "status_depois": status,
        })
    return changed


def attach_units_to_mov(db, movimentacao_id, units):
    for unit in units:
        db.execute(
            """
            INSERT INTO movimentacao_unidades
            (movimentacao_id, produto_unidade_id, codigo_unidade, status_antes, status_depois)
            VALUES (?, ?, ?, ?, ?)
            """,
            (movimentacao_id, unit["id"], unit["codigo_unidade"], unit["status_antes"], unit["status_depois"]),
        )
