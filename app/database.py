import sqlite3
from pathlib import Path
from werkzeug.security import generate_password_hash

_db_path = "estoque_v2.db"


def set_db_path(path: str):
    global _db_path
    _db_path = path


def get_db():
    conn = sqlite3.connect(_db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def row_to_dict(row):
    return dict(row) if row else None


def rows_to_list(rows):
    return [dict(r) for r in rows]


def init_db(path: str = "estoque_v2.db"):
    set_db_path(path)
    Path(path).parent.mkdir(parents=True, exist_ok=True) if Path(path).parent != Path('.') else None
    with get_db() as db:
        db.executescript(SCHEMA)
        apply_migrations(db)
        seed_default_user(db)
        seed_default_locations(db)
        db.commit()


def has_column(db, table, column):
    return any(row["name"] == column for row in db.execute(f"PRAGMA table_info({table})").fetchall())


def apply_migrations(db):
    if not has_column(db, "produtos", "marca"):
        db.execute("ALTER TABLE produtos ADD COLUMN marca TEXT")
    if not has_column(db, "produtos", "tipo_controle"):
        db.execute("ALTER TABLE produtos ADD COLUMN tipo_controle TEXT NOT NULL DEFAULT 'quantidade'")
    if not has_column(db, "produtos", "prefixo_rastreio"):
        db.execute("ALTER TABLE produtos ADD COLUMN prefixo_rastreio TEXT")
    if not has_column(db, "movimentacoes", "unidades_codigos"):
        db.execute("ALTER TABLE movimentacoes ADD COLUMN unidades_codigos TEXT")
    if not has_column(db, "emprestimos", "unidades_codigos"):
        db.execute("ALTER TABLE emprestimos ADD COLUMN unidades_codigos TEXT")
    db.execute("""
        CREATE TABLE IF NOT EXISTS produto_unidades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            produto_id INTEGER NOT NULL,
            codigo_unidade TEXT NOT NULL UNIQUE,
            status TEXT NOT NULL DEFAULT 'disponivel' CHECK(status IN ('disponivel','retirado','emprestado','descartado')),
            localizacao_id INTEGER NOT NULL,
            criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            observacao TEXT,
            FOREIGN KEY (produto_id) REFERENCES produtos(id),
            FOREIGN KEY (localizacao_id) REFERENCES localizacoes(id)
        )
    """)
    db.execute("CREATE INDEX IF NOT EXISTS idx_unidades_produto_status ON produto_unidades(produto_id, status)")
    db.execute("CREATE INDEX IF NOT EXISTS idx_unidades_codigo ON produto_unidades(codigo_unidade)")
    db.execute("""
        CREATE TABLE IF NOT EXISTS movimentacao_unidades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            movimentacao_id INTEGER NOT NULL,
            unidade_id INTEGER NOT NULL,
            codigo_unidade TEXT NOT NULL,
            status_resultante TEXT NOT NULL,
            criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (movimentacao_id) REFERENCES movimentacoes(id),
            FOREIGN KEY (unidade_id) REFERENCES produto_unidades(id),
            UNIQUE(movimentacao_id, unidade_id)
        )
    """)
    db.execute("CREATE INDEX IF NOT EXISTS idx_mov_unidades_mov ON movimentacao_unidades(movimentacao_id)")
    db.execute("CREATE INDEX IF NOT EXISTS idx_mov_unidades_codigo ON movimentacao_unidades(codigo_unidade)")
    db.execute("""
        CREATE TABLE IF NOT EXISTS codigo_barras_sequence (
            id INTEGER PRIMARY KEY CHECK(id = 1),
            last_value INTEGER NOT NULL DEFAULT 0
        )
    """)
    if not db.execute("SELECT id FROM codigo_barras_sequence WHERE id = 1").fetchone():
        maior = 0
        rows = db.execute("SELECT codigo_barras FROM produtos WHERE codigo_barras LIKE 'P%'").fetchall()
        for row in rows:
            value = row["codigo_barras"] or ""
            if len(value) == 8 and value[0] == "P" and value[1:].isdigit():
                maior = max(maior, int(value[1:]))
        db.execute("INSERT INTO codigo_barras_sequence (id, last_value) VALUES (1, ?)", (maior,))


def seed_default_user(db):
    exists = db.execute("SELECT id FROM usuarios WHERE username = ?", ("admin",)).fetchone()
    if not exists:
        db.execute(
            "INSERT INTO usuarios (username, nome, password_hash, perfil, ativo) VALUES (?, ?, ?, ?, 1)",
            ("admin", "Administrador", generate_password_hash("admin123"), "admin"),
        )


def seed_default_locations(db):
    prateleiras = [
        ("ARM01", "P1", "Leitores e Scanner", 1),
        ("ARM01", "P2", "Cabos Telefone e Diversos", 2),
        ("ARM01", "P3", "Baterias, SSDs e Adaptadores", 3),
        ("ARM01", "P4", "DP/HDMI, Mouse e Adaptadores", 4),
        ("ARM01", "P5", "Fones, Impressora e Diversos", 5),
        ("ARM01", "P6", "Teclados e Cabos", 6),
    ]
    for armario, codigo, nome, ordem in prateleiras:
        db.execute(
            """
            INSERT OR IGNORE INTO prateleiras (armario, codigo, nome, ordem, ativo)
            VALUES (?, ?, ?, ?, 1)
            """,
            (armario, codigo, nome, ordem),
        )

    locais = [
        ("ARM01-P1-LIMPEZA", "Limpeza e Pasta Térmica", "Limpa contato e pasta térmica", "ARM01", "P1", 1),
        ("ARM01-P1-LEITORES", "Leitores e Scanner", "Leitores de código de barras, scanner e acessórios", "ARM01", "P1", 2),
        ("ARM01-P2-CABOS-TELEFONE", "Cabos Telefone", "Cabos RJ11, telefone e derivados", "ARM01", "P2", 1),
        ("ARM01-P2-CABOS-REDE", "Cabos de Rede", "Cabos RJ45 e rede diversos", "ARM01", "P2", 2),
        ("ARM01-P2-DIVERSOS", "Diversos", "Fitas, USB serial e dispositivos diversos", "ARM01", "P2", 3),
        ("ARM01-P3-BATERIAS", "Baterias", "Baterias e pilhas", "ARM01", "P3", 1),
        ("ARM01-P3-SSDS", "SSDs", "SSDs SATA/NVMe e armazenamento", "ARM01", "P3", 2),
        ("ARM01-P3-ADAPTADORES", "Adaptadores de Rede", "Adaptadores USB/RJ45 e rede", "ARM01", "P3", 3),
        ("ARM01-P4-DPHDMI", "Cabos DP/HDMI", "Cabos DisplayPort, HDMI e conversores de vídeo", "ARM01", "P4", 1),
        ("ARM01-P4-MOUSE", "Mouses", "Mouses com fio e sem fio", "ARM01", "P4", 2),
        ("ARM01-P4-ADAPTADORES", "Adaptadores + HDMI em Caixa", "Adaptadores e HDMI embalados", "ARM01", "P4", 3),
        ("ARM01-P5-FONES", "Fones", "Fones e headsets", "ARM01", "P5", 1),
        ("ARM01-P5-IMPRESSORA", "Cabos Impressora", "Cabos e acessórios de impressora", "ARM01", "P5", 2),
        ("ARM01-P5-DIVERSOS", "Diversos", "Itens diversos da prateleira 5", "ARM01", "P5", 3),
        ("ARM01-P6-TECLADOS", "Teclados", "Teclados USB e sem fio", "ARM01", "P6", 1),
        ("ARM01-P6-CABOS", "Cabos", "Cabos avulsos", "ARM01", "P6", 2),
        ("ARM01-P6-IMPRESSORA", "Toner, Fusor e Bases HP", "Suprimentos e peças de impressora HP", "ARM01", "P6", 3),
    ]
    for codigo, nome, desc, armario, prateleira, ordem in locais:
        db.execute(
            """
            INSERT OR IGNORE INTO localizacoes (codigo, nome, descricao, armario, prateleira, ordem, ativo)
            VALUES (?, ?, ?, ?, ?, ?, 1)
            """,
            (codigo, nome, desc, armario, prateleira, ordem),
        )


SCHEMA = r"""
CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    nome TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    perfil TEXT NOT NULL DEFAULT 'operador',
    ativo INTEGER NOT NULL DEFAULT 1,
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS prateleiras (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    armario TEXT NOT NULL,
    codigo TEXT NOT NULL,
    nome TEXT NOT NULL,
    ordem INTEGER NOT NULL DEFAULT 0,
    ativo INTEGER NOT NULL DEFAULT 1,
    UNIQUE(armario, codigo)
);

CREATE TABLE IF NOT EXISTS localizacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT NOT NULL UNIQUE,
    nome TEXT NOT NULL,
    descricao TEXT,
    armario TEXT NOT NULL,
    prateleira TEXT NOT NULL,
    ordem INTEGER NOT NULL DEFAULT 0,
    ativo INTEGER NOT NULL DEFAULT 1,
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (armario, prateleira) REFERENCES prateleiras(armario, codigo)
);

CREATE TABLE IF NOT EXISTS produtos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT NOT NULL UNIQUE,
    nome TEXT NOT NULL,
    categoria TEXT,
    marca TEXT,
    modelo TEXT,
    codigo_barras TEXT UNIQUE,
    quantidade_atual INTEGER NOT NULL DEFAULT 0,
    estoque_minimo INTEGER NOT NULL DEFAULT 0,
    tipo_controle TEXT NOT NULL DEFAULT 'quantidade' CHECK(tipo_controle IN ('quantidade','unidade')),
    prefixo_rastreio TEXT,
    localizacao_id INTEGER NOT NULL,
    observacao TEXT,
    ativo INTEGER NOT NULL DEFAULT 1,
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TEXT,
    FOREIGN KEY (localizacao_id) REFERENCES localizacoes(id)
);

CREATE INDEX IF NOT EXISTS idx_produtos_nome ON produtos(nome);
CREATE INDEX IF NOT EXISTS idx_produtos_codigo_barras ON produtos(codigo_barras);
CREATE INDEX IF NOT EXISTS idx_produtos_localizacao ON produtos(localizacao_id);

CREATE TABLE IF NOT EXISTS movimentacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    produto_id INTEGER NOT NULL,
    tipo TEXT NOT NULL CHECK(tipo IN ('entrada','retirada','emprestimo','devolucao','descarte','mover')),
    quantidade INTEGER NOT NULL DEFAULT 0,
    quantidade_antes INTEGER,
    quantidade_depois INTEGER,
    responsavel_origem TEXT,
    responsavel_destino TEXT,
    destino TEXT,
    motivo TEXT,
    observacao TEXT,
    unidades_codigos TEXT,
    localizacao_origem_id INTEGER,
    localizacao_destino_id INTEGER,
    usuario_id INTEGER,
    data_hora TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (produto_id) REFERENCES produtos(id),
    FOREIGN KEY (localizacao_origem_id) REFERENCES localizacoes(id),
    FOREIGN KEY (localizacao_destino_id) REFERENCES localizacoes(id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_mov_produto ON movimentacoes(produto_id);
CREATE INDEX IF NOT EXISTS idx_mov_data ON movimentacoes(data_hora);

CREATE TABLE IF NOT EXISTS emprestimos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    produto_id INTEGER NOT NULL,
    quantidade INTEGER NOT NULL,
    entregue_por TEXT NOT NULL,
    emprestado_para TEXT NOT NULL,
    destino TEXT,
    observacao TEXT,
    unidades_codigos TEXT,
    status TEXT NOT NULL DEFAULT 'aberto' CHECK(status IN ('aberto','devolvido')),
    data_emprestimo TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_devolucao TEXT,
    recebido_por TEXT,
    movimentacao_emprestimo_id INTEGER,
    movimentacao_devolucao_id INTEGER,
    FOREIGN KEY (produto_id) REFERENCES produtos(id),
    FOREIGN KEY (movimentacao_emprestimo_id) REFERENCES movimentacoes(id),
    FOREIGN KEY (movimentacao_devolucao_id) REFERENCES movimentacoes(id)
);

CREATE INDEX IF NOT EXISTS idx_emp_status ON emprestimos(status);

CREATE TABLE IF NOT EXISTS movimentacao_unidades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    movimentacao_id INTEGER NOT NULL,
    unidade_id INTEGER NOT NULL,
    codigo_unidade TEXT NOT NULL,
    status_resultante TEXT NOT NULL,
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (movimentacao_id) REFERENCES movimentacoes(id),
    FOREIGN KEY (unidade_id) REFERENCES produto_unidades(id),
    UNIQUE(movimentacao_id, unidade_id)
);

CREATE INDEX IF NOT EXISTS idx_mov_unidades_mov ON movimentacao_unidades(movimentacao_id);
CREATE INDEX IF NOT EXISTS idx_mov_unidades_codigo ON movimentacao_unidades(codigo_unidade);

CREATE TABLE IF NOT EXISTS codigo_barras_sequence (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    last_value INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER,
    acao TEXT NOT NULL,
    entidade TEXT NOT NULL,
    entidade_id INTEGER,
    detalhe TEXT,
    data_hora TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);
"""
