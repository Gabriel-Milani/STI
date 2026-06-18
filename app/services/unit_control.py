def is_unit_product(produto):
    return (produto["tipo_controle"] if "tipo_controle" in produto.keys() else "quantidade") == "unidade"


def sync_unit_stock(db, produto_id):
    total = db.execute(
        "SELECT COUNT(*) AS total FROM produto_unidades WHERE produto_id = ? AND status = 'disponivel'",
        (produto_id,),
    ).fetchone()["total"]
    db.execute("UPDATE produtos SET quantidade_atual = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?", (total, produto_id))
    return total


def next_unit_number(db, prefixo):
    rows = db.execute(
        "SELECT codigo_unidade FROM produto_unidades WHERE codigo_unidade LIKE ?",
        (f"{prefixo}-%",),
    ).fetchall()
    maior = 0
    for row in rows:
        suffix = str(row["codigo_unidade"]).rsplit("-", 1)[-1]
        if suffix.isdigit():
            maior = max(maior, int(suffix))
    return maior + 1


def create_units(db, produto, quantidade, observacao=None):
    prefixo = (produto["prefixo_rastreio"] or "").strip()
    if not prefixo:
        raise ValueError("Informe o prefixo de rastreio para produto por unidade.")
    start = next_unit_number(db, prefixo)
    codigos = []
    for offset in range(quantidade):
        codigo = f"{prefixo}-{start + offset}"
        db.execute(
            """
            INSERT INTO produto_unidades (produto_id, codigo_unidade, status, localizacao_id, observacao)
            VALUES (?, ?, 'disponivel', ?, ?)
            """,
            (produto["id"], codigo, produto["localizacao_id"], observacao),
        )
        codigos.append(codigo)
    return codigos


def take_available_units(db, produto_id, quantidade, status):
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
    ids = [row["id"] for row in rows]
    placeholders = ",".join("?" for _ in ids)
    db.execute(f"UPDATE produto_unidades SET status = ? WHERE id IN ({placeholders})", [status, *ids])
    return [row["codigo_unidade"] for row in rows]


def restore_units(db, codigos):
    if not codigos:
        return
    placeholders = ",".join("?" for _ in codigos)
    db.execute(
        f"UPDATE produto_unidades SET status = 'disponivel' WHERE codigo_unidade IN ({placeholders}) AND status = 'emprestado'",
        codigos,
    )


def record_movement_units(db, movimentacao_id, codigos, status_resultante):
    if not codigos:
        return
    placeholders = ",".join("?" for _ in codigos)
    rows = db.execute(
        f"SELECT id, codigo_unidade FROM produto_unidades WHERE codigo_unidade IN ({placeholders})",
        codigos,
    ).fetchall()
    for row in rows:
        db.execute(
            """
            INSERT OR IGNORE INTO movimentacao_unidades
            (movimentacao_id, unidade_id, codigo_unidade, status_resultante)
            VALUES (?, ?, ?, ?)
            """,
            (movimentacao_id, row["id"], row["codigo_unidade"], status_resultante),
        )


def split_codes(value):
    return [item.strip() for item in (value or "").split(",") if item.strip()]
