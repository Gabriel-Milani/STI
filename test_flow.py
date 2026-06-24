import os
import tempfile
from pathlib import Path

fd, db_path = tempfile.mkstemp(suffix=".db")
os.close(fd)
os.unlink(db_path)
os.environ["DATABASE_PATH"] = db_path

from app import create_app  # noqa: E402
from app.database import backup_database, get_db  # noqa: E402

app = create_app()
client = app.test_client()


def assert_ok(response, status=200):
    assert response.status_code == status, (response.status_code, response.json)
    assert response.json["ok"] is True, response.json
    return response.json


def assert_error(response, status):
    assert response.status_code == status, (response.status_code, response.json)
    assert response.json["ok"] is False, response.json
    return response.json


def login():
    assert_ok(client.post("/api/auth/login", json={"username": "admin", "password": "admin123"}))


def test_quantidade():
    response = client.post(
        "/api/produtos",
        json={
            "nome": "Limpa contato",
            "categoria": "Limpeza",
            "modelo": "LC-300",
            "quantidade_inicial": 3,
            "estoque_minimo": 1,
            "localizacao_codigo": "ARM01-P1-LIMPEZA-E-PASTA-TERMICA",
        },
    )
    data = assert_ok(response, 201)["data"]
    produto_id = data["id"]

    assert_ok(client.get("/api/produtos?q=LC-300"))
    assert_ok(client.post("/api/movimentacoes/entrada", json={"produto_id": produto_id, "quantidade": 2}))
    assert_ok(client.post("/api/movimentacoes/retirada", json={"produto_id": produto_id, "quantidade": 1, "entregue_para": "Joao"}))
    assert_error(client.post("/api/movimentacoes/retirada", json={"produto_id": produto_id, "quantidade": 10, "entregue_para": "Joao"}), 409)
    detalhe = assert_ok(client.get(f"/api/produtos/{produto_id}"))["data"]["produto"]
    assert detalhe["quantidade_atual"] == 4
    assert detalhe["codigo_barras"].startswith("P")


def test_unidade():
    response = client.post(
        "/api/produtos",
        json={
            "nome": "Mouse-Novo",
            "categoria": "Mouse",
            "modelo": "MN-1",
            "tipo_controle": "unidade",
            "prefixo_rastreio": "0300",
            "quantidade_inicial": 2,
            "estoque_minimo": 1,
            "localizacao_codigo": "ARM01-P4-MOUSES",
        },
    )
    produto_id = assert_ok(response, 201)["data"]["id"]
    detalhe = assert_ok(client.get(f"/api/produtos/{produto_id}"))["data"]
    assert [u["codigo_unidade"] for u in detalhe["unidades"]] == ["0300-1", "0300-2"]

    assert_ok(client.post("/api/movimentacoes/entrada", json={"produto_id": produto_id, "quantidade": 1}))
    detalhe = assert_ok(client.get(f"/api/produtos/{produto_id}"))["data"]
    assert [u["codigo_unidade"] for u in detalhe["unidades"]] == ["0300-1", "0300-2", "0300-3"]
    assert_error(client.post("/api/movimentacoes/retirada", json={"produto_id": produto_id, "quantidade": 1, "entregue_para": "Maria"}), 400)
    assert_ok(client.post(
        "/api/movimentacoes/retirada",
        json={"produto_id": produto_id, "quantidade": 1, "entregue_para": "Maria", "unidades_codigos": ["0300-2"]},
    ))
    detalhe = assert_ok(client.get(f"/api/produtos/{produto_id}"))["data"]
    status_por_codigo = {u["codigo_unidade"]: u["status"] for u in detalhe["unidades"]}
    assert status_por_codigo["0300-1"] == "disponivel"
    assert status_por_codigo["0300-2"] == "retirado"
    antes_mover = detalhe["produto"]["quantidade_atual"]
    assert_ok(client.post(f"/api/produtos/{produto_id}/mover", json={"localizacao_codigo": "ARM01-P4-ADAPTADORES-HDMI-EM-CAIXA"}))
    depois_mover = assert_ok(client.get(f"/api/produtos/{produto_id}"))["data"]["produto"]["quantidade_atual"]
    assert depois_mover == antes_mover
    scan = assert_ok(client.get("/api/scanner/buscar/0300-2"))["data"]
    assert scan["tipo"] == "unidade"
    assert scan["unidade"]["status"] == "retirado"

    with get_db() as db:
        vinculadas = db.execute("SELECT COUNT(*) AS total FROM movimentacao_unidades").fetchone()["total"]
        assert vinculadas >= 4


def test_usuarios():
    response = client.post(
        "/api/usuarios",
        json={"nome": "João Silva", "usuario": "joao", "senha": "1234", "confirmar_senha": "1234", "ativo": True},
    )
    joao_id = assert_ok(response, 201)["data"]["id"]
    usuarios = assert_ok(client.get("/api/usuarios"))["data"]["usuarios"]
    assert any(user["usuario"] == "joao" for user in usuarios)

    assert_ok(client.post("/api/auth/login", json={"username": "joao", "password": "1234"}))
    produto = assert_ok(client.post(
        "/api/produtos",
        json={
            "nome": "Cabo USB",
            "categoria": "Cabos",
            "modelo": "USB-A",
            "quantidade_inicial": 2,
            "estoque_minimo": 0,
            "localizacao_codigo": "ARM01-P6-CABOS",
        },
    ), 201)["data"]
    assert_ok(client.post("/api/movimentacoes/retirada", json={"produto_id": produto["id"], "quantidade": 1, "entregue_para": "Joao"}))
    historico = assert_ok(client.get(f"/api/produtos/{produto['id']}"))["data"]["movimentacoes"]
    assert historico[0]["usuario_nome"] == "João Silva"

    assert_ok(client.post("/api/auth/login", json={"username": "admin", "password": "admin123"}))
    assert_ok(client.post(f"/api/usuarios/{joao_id}/desativar", json={}))
    assert_error(client.post("/api/auth/login", json={"username": "joao", "password": "1234"}), 403)
    assert_ok(client.post("/api/auth/login", json={"username": "admin", "password": "admin123"}))
    assert_ok(client.post(f"/api/usuarios/{joao_id}/resetar-senha", json={"senha": "5678", "confirmar_senha": "5678"}))
    assert_ok(client.post(f"/api/usuarios/{joao_id}/ativar", json={}))
    joao_client = app.test_client()
    assert_ok(joao_client.post("/api/auth/login", json={"username": "joao", "password": "5678"}))
    assert_ok(client.post(f"/api/usuarios/{joao_id}/desativar", json={}))
    assert_error(joao_client.get("/api/produtos"), 403)
    assert_ok(client.post(f"/api/usuarios/{joao_id}/ativar", json={}))
    assert_ok(client.post("/api/auth/login", json={"username": "joao", "password": "5678"}))
    assert_ok(client.get("/api/auth/me"))
    joao_client = app.test_client()
    assert_ok(joao_client.post("/api/auth/login", json={"username": "joao", "password": "5678"}))
    assert_ok(client.post("/api/auth/login", json={"username": "admin", "password": "admin123"}))
    assert_ok(client.post(f"/api/usuarios/{joao_id}/desativar", json={}))
    assert_error(joao_client.get("/api/auth/me"), 403)

    assert_ok(client.post("/api/auth/login", json={"username": "admin", "password": "admin123"}))
    assert_error(
        client.post("/api/usuarios", json={"nome": "João Silva 2", "usuario": "joao", "senha": "1234", "confirmar_senha": "1234"}),
        409,
    )
    assert_ok(client.post(f"/api/usuarios/{joao_id}/desativar", json={}))
    assert_error(client.post("/api/usuarios/1/desativar", json={}), 409)


def test_backup_database():
    backup_dir = Path(tempfile.mkdtemp())
    backup_path = backup_database(db_path, str(backup_dir), retention=2)
    assert backup_path and backup_path.exists()
    assert backup_path.stat().st_size > 0


if __name__ == "__main__":
    login()
    test_quantidade()
    test_unidade()
    test_usuarios()
    test_backup_database()
    print("Todos os fluxos principais passaram.")
