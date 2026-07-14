from ..services.helpers import audit, location_label, parse_int
from ..services.stock_movements import StockError, register_product_movement


class TerminalOperationError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


class TerminalService:
    @staticmethod
    def _token(value):
        return (value or "").strip().upper()

    @staticmethod
    def _find_product(db, codigo):
        token = TerminalService._token(codigo)
        if not token:
            return None
        return db.execute(
            "SELECT * FROM produtos WHERE ativo = 1 AND (UPPER(codigo) = ? OR UPPER(codigo_barras) = ?)",
            (token, token),
        ).fetchone()

    @staticmethod
    def _find_location(db, codigo):
        token = TerminalService._token(codigo)
        if not token:
            return None
        return db.execute(
            "SELECT * FROM localizacoes WHERE ativo = 1 AND (UPPER(codigo) = ? OR UPPER(nome) = ?)",
            (token, token),
        ).fetchone()

    @staticmethod
    def _active_loan(db, produto_id):
        return db.execute(
            "SELECT * FROM emprestimos WHERE produto_id = ? AND status = 'aberto' ORDER BY data_emprestimo DESC LIMIT 1",
            (produto_id,),
        ).fetchone()

    @staticmethod
    def _quantity(data):
        value = data.get("quantidade")
        if value in (None, ""):
            return 1
        return parse_int(value, 0)

    @staticmethod
    def resolve_scan(db, codigo):
        token = TerminalService._token(codigo)
        if not token:
            raise TerminalOperationError("QR inválido.", 400)

        produto = TerminalService._find_product(db, token)
        if produto:
            loc = db.execute("SELECT * FROM localizacoes WHERE id = ?", (produto["localizacao_id"],)).fetchone()
            emprestimo = TerminalService._active_loan(db, produto["id"])
            return {
                "tipo": "produto",
                "produto": {
                    **dict(produto),
                    "localizacao": dict(loc) if loc else None,
                    "localizacao_label": location_label(loc),
                    "emprestimo_ativo": dict(emprestimo) if emprestimo else None,
                },
            }

        localizacao = TerminalService._find_location(db, token)
        if localizacao:
            return {
                "tipo": "localizacao",
                "localizacao": {**dict(localizacao), "label": location_label(localizacao)},
            }

        usuario = db.execute(
            "SELECT * FROM usuarios WHERE ativo = 1 AND (UPPER(username) = ? OR UPPER(nome) = ?)",
            (token, token),
        ).fetchone()
        if usuario:
            return {
                "tipo": "usuario",
                "usuario": dict(usuario),
            }

        raise TerminalOperationError("Item não encontrado.", 404)

    @staticmethod
    def handle_action(db, data, usuario_id, usuario_nome):
        action = (data.get("action") or "").strip().lower()
        codigo = (data.get("codigo") or "").strip()
        if not action:
            raise TerminalOperationError("Ação inválida.", 400)

        produto = TerminalService._find_product(db, codigo)
        if not produto:
            raise TerminalOperationError("Produto não encontrado.", 404)

        quantidade = TerminalService._quantity(data)
        if quantidade < 1:
            raise TerminalOperationError("Quantidade inválida.", 400)

        if action == "entrada":
            observacao = (data.get("observacao") or "").strip()
            return TerminalService._register_entrada(db, produto, quantidade, observacao, usuario_id, usuario_nome)

        if action == "retirar":
            destino = (data.get("usuario") or "").strip()
            observacao = (data.get("observacao") or "").strip()
            if not destino:
                raise TerminalOperationError("Informe um usuário para retirada.", 400)
            return TerminalService._register_retirada(db, produto, destino, observacao, usuario_id, usuario_nome, quantidade)

        if action == "emprestar":
            destino = (data.get("usuario") or "").strip()
            data_prevista = (data.get("data_prevista") or "").strip()
            observacao = (data.get("observacao") or "").strip()
            if not destino:
                raise TerminalOperationError("Informe um usuário para empréstimo.", 400)
            return TerminalService._register_emprestimo(db, produto, destino, data_prevista, observacao, usuario_id, usuario_nome, quantidade)

        if action == "devolver":
            return TerminalService._register_devolucao(db, produto, data, usuario_id, usuario_nome)

        if action == "mover":
            destino = (data.get("destino") or "").strip()
            if not destino:
                raise TerminalOperationError("Informe uma localização válida.", 400)
            return TerminalService._register_mover(db, produto, destino, data, usuario_id)

        if action == "consultar":
            return TerminalService._build_consultation_payload(db, produto)

        raise TerminalOperationError("Ação não suportada.", 400)

    @staticmethod
    def _register_entrada(db, produto, quantidade, observacao, usuario_id, usuario_nome):
        data = {
            "responsavel_origem": usuario_nome or "Usuário logado",
            "observacao": observacao,
        }
        mov_id, depois = TerminalService._register_stock_movement(db, produto, "entrada", quantidade, data)
        audit(db, usuario_id, "entrada", "produto", produto["id"], f"{produto['codigo']}")
        return {"status": "ok", "mensagem": f"Entrada de {quantidade} unidade(s) registrada.", "quantidade_atual": depois, "movimentacao_id": mov_id}

    @staticmethod
    def _register_retirada(db, produto, destino, observacao, usuario_id, usuario_nome, quantidade=1):
        data = {
            "entregue_por": usuario_nome or "Usuário logado",
            "entregue_para": destino,
            "observacao": observacao,
        }
        mov_id, depois = TerminalService._register_stock_movement(db, produto, "retirada", quantidade, data)
        audit(db, usuario_id, "retirada", "produto", produto["id"], f"{produto['codigo']}")
        return {"status": "ok", "mensagem": f"Retirada de {quantidade} unidade(s) registrada.", "quantidade_atual": depois, "movimentacao_id": mov_id}

    @staticmethod
    def _register_emprestimo(db, produto, destino, data_prevista, observacao, usuario_id, usuario_nome, quantidade=1):
        data = {
            "entregue_por": usuario_nome or "Usuário logado",
            "emprestado_para": destino,
            "destino": data_prevista,
            "observacao": observacao,
        }
        mov_id, depois = TerminalService._register_stock_movement(db, produto, "emprestimo", quantidade, data)
        db.execute(
            "INSERT INTO emprestimos (produto_id, quantidade, entregue_por, emprestado_para, destino, observacao, status, movimentacao_emprestimo_id) VALUES (?, ?, ?, ?, ?, ?, 'aberto', ?)",
            (produto["id"], quantidade, data["entregue_por"], destino, data_prevista, observacao, mov_id),
        )
        audit(db, usuario_id, "emprestimo", "produto", produto["id"], f"{produto['codigo']}")
        return {"status": "ok", "mensagem": f"Empréstimo de {quantidade} unidade(s) registrado.", "quantidade_atual": depois, "movimentacao_id": mov_id}

    @staticmethod
    def _register_devolucao(db, produto, data, usuario_id, usuario_nome):
        emp = TerminalService._active_loan(db, produto["id"])
        if not emp:
            raise TerminalOperationError("Nenhum empréstimo aberto para este item.", 400)
        qtd = emp["quantidade"]
        antes = produto["quantidade_atual"]
        depois = antes + qtd
        db.execute("UPDATE produtos SET quantidade_atual = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?", (depois, produto["id"]))
        cur = db.execute(
            "INSERT INTO movimentacoes (produto_id, tipo, quantidade, quantidade_antes, quantidade_depois, responsavel_origem, responsavel_destino, observacao, localizacao_origem_id, localizacao_destino_id, usuario_id) VALUES (?, 'devolucao', ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (produto["id"], qtd, antes, depois, emp["emprestado_para"], usuario_nome or "Usuário logado", (data.get("observacao") or "").strip(), produto["localizacao_id"], produto["localizacao_id"], usuario_id),
        )
        db.execute("UPDATE emprestimos SET status='devolvido', data_devolucao=CURRENT_TIMESTAMP, recebido_por=?, movimentacao_devolucao_id=? WHERE id=?", (usuario_nome or "Usuário logado", cur.lastrowid, emp["id"]))
        audit(db, usuario_id, "devolucao", "produto", produto["id"], f"{produto['codigo']}")
        return {"status": "ok", "mensagem": f"Devolução de {qtd} unidade(s) registrada.", "quantidade_atual": depois, "movimentacao_id": cur.lastrowid}

    @staticmethod
    def _register_mover(db, produto, destino, data, usuario_id):
        localizacao = TerminalService._find_location(db, destino)
        if not localizacao:
            raise TerminalOperationError("Localização inválida.", 400)
        origem_id = produto["localizacao_id"]
        if origem_id == localizacao["id"]:
            raise TerminalOperationError("O item já está nessa localização.", 400)
        db.execute("UPDATE produtos SET localizacao_id = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?", (localizacao["id"], produto["id"]))
        db.execute(
            "INSERT INTO movimentacoes (produto_id, tipo, quantidade, quantidade_antes, quantidade_depois, observacao, localizacao_origem_id, localizacao_destino_id, usuario_id) VALUES (?, 'mover', 0, ?, ?, ?, ?, ?, ?)",
            (produto["id"], produto["quantidade_atual"], produto["quantidade_atual"], (data.get("observacao") or "").strip(), origem_id, localizacao["id"], usuario_id),
        )
        audit(db, usuario_id, "mover", "produto", produto["id"], f"{produto['codigo']}")
        return {"status": "ok", "mensagem": "Localização atualizada.", "localizacao": dict(localizacao)}

    @staticmethod
    def _build_consultation_payload(db, produto):
        loc = db.execute("SELECT * FROM localizacoes WHERE id = ?", (produto["localizacao_id"],)).fetchone()
        movs = db.execute(
            """
            SELECT
                m.tipo,
                m.quantidade,
                m.quantidade_antes,
                m.quantidade_depois,
                m.responsavel_origem,
                m.responsavel_destino,
                m.destino,
                m.observacao,
                m.data_hora,
                lo.codigo AS localizacao_origem_codigo,
                lo.nome AS localizacao_origem_nome,
                lo.armario AS localizacao_origem_armario,
                lo.prateleira AS localizacao_origem_prateleira,
                ld.codigo AS localizacao_destino_codigo,
                ld.nome AS localizacao_destino_nome,
                ld.armario AS localizacao_destino_armario,
                ld.prateleira AS localizacao_destino_prateleira
            FROM movimentacoes m
            LEFT JOIN localizacoes lo ON lo.id = m.localizacao_origem_id
            LEFT JOIN localizacoes ld ON ld.id = m.localizacao_destino_id
            WHERE m.produto_id = ?
            ORDER BY m.data_hora DESC
            LIMIT 8
            """,
            (produto["id"],),
        ).fetchall()
        historico = []
        for item in movs:
            data = dict(item)
            data["localizacao_origem_label"] = location_label({
                "nome": data["localizacao_origem_nome"],
                "armario": data["localizacao_origem_armario"],
                "prateleira": data["localizacao_origem_prateleira"],
            }) if data["localizacao_origem_nome"] else None
            data["localizacao_destino_label"] = location_label({
                "nome": data["localizacao_destino_nome"],
                "armario": data["localizacao_destino_armario"],
                "prateleira": data["localizacao_destino_prateleira"],
            }) if data["localizacao_destino_nome"] else None
            historico.append(data)
        return {
            "status": "ok",
            "mensagem": "Consulta realizada.",
            "produto": {
                **dict(produto),
                "localizacao": dict(loc) if loc else None,
                "localizacao_label": location_label(loc),
            },
            "historico": historico,
        }

    @staticmethod
    def _register_stock_movement(db, produto, tipo, quantidade, data):
        try:
            _, mov_id, depois = register_product_movement(db, produto["id"], tipo, quantidade, data)
            return mov_id, depois
        except StockError as error:
            raise TerminalOperationError(error.message, error.status) from error
