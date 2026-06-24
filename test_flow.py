import os
import tempfile
from io import BytesIO
from pathlib import Path

fd, db_path = tempfile.mkstemp(suffix=".db")
os.close(fd)
os.unlink(db_path)
os.environ["DATABASE_PATH"] = db_path
os.environ["SECRET_KEY"] = "test-secret-key"

from app import create_app  # noqa: E402
from app.database import backup_database, get_db  # noqa: E402
from openpyxl import Workbook  # noqa: E402

app = create_app()
client = app.test_client()
csrf_tokens = {}


def assert_ok(response, status=200):
    assert response.status_code == status, (response.status_code, response.json)
    assert response.json["ok"] is True, response.json
    return response.json


def assert_error(response, status):
    assert response.status_code == status, (response.status_code, response.json)
    assert response.json["ok"] is False, response.json
    return response.json


def login(target_client=client, username="admin", password="admin123"):
    data = assert_ok(target_client.post("/api/auth/login", json={"username": username, "password": password}))["data"]
    csrf_tokens[id(target_client)] = data["csrf_token"]
    return data


def csrf_headers(target_client=client):
    token = csrf_tokens.get(id(target_client))
    if not token:
        data = assert_ok(target_client.get("/api/auth/me"))["data"]
        token = data["csrf_token"]
        csrf_tokens[id(target_client)] = token
    return {"X-CSRF-Token": token}


def api_post(path, json=None, target_client=client):
    return target_client.post(path, json=json or {}, headers=csrf_headers(target_client))


def api_put(path, json=None, target_client=client):
    return target_client.put(path, json=json or {}, headers=csrf_headers(target_client))


def api_upload(path, data, target_client=client):
    return target_client.post(path, data=data, content_type="multipart/form-data", headers=csrf_headers(target_client))


def setup_module(_module):
    login()


def test_quantidade():
    assert_error(client.post("/api/produtos", json={"nome": "Sem CSRF"}), 403)
    response = api_post(
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
    assert_ok(api_post("/api/movimentacoes/entrada", json={"produto_id": produto_id, "quantidade": 2}))
    assert_ok(api_post("/api/movimentacoes/retirada", json={"produto_id": produto_id, "quantidade": 1, "entregue_para": "Joao"}))
    assert_error(api_post("/api/movimentacoes/retirada", json={"produto_id": produto_id, "quantidade": 10, "entregue_para": "Joao"}), 409)
    detalhe = assert_ok(client.get(f"/api/produtos/{produto_id}"))["data"]["produto"]
    assert detalhe["quantidade_atual"] == 4
    assert detalhe["codigo_barras"].startswith("P")


def test_unidade():
    response = api_post(
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

    assert_ok(api_post("/api/movimentacoes/entrada", json={"produto_id": produto_id, "quantidade": 1}))
    detalhe = assert_ok(client.get(f"/api/produtos/{produto_id}"))["data"]
    assert [u["codigo_unidade"] for u in detalhe["unidades"]] == ["0300-1", "0300-2", "0300-3"]
    assert_error(api_post("/api/movimentacoes/retirada", json={"produto_id": produto_id, "quantidade": 1, "entregue_para": "Maria"}), 400)
    assert_ok(api_post(
        "/api/movimentacoes/retirada",
        json={"produto_id": produto_id, "quantidade": 1, "entregue_para": "Maria", "unidades_codigos": ["0300-2"]},
    ))
    detalhe = assert_ok(client.get(f"/api/produtos/{produto_id}"))["data"]
    status_por_codigo = {u["codigo_unidade"]: u["status"] for u in detalhe["unidades"]}
    assert status_por_codigo["0300-1"] == "disponivel"
    assert status_por_codigo["0300-2"] == "retirado"
    antes_mover = detalhe["produto"]["quantidade_atual"]
    assert_ok(api_post(f"/api/produtos/{produto_id}/mover", json={"localizacao_codigo": "ARM01-P4-ADAPTADORES-HDMI-EM-CAIXA"}))
    depois_mover = assert_ok(client.get(f"/api/produtos/{produto_id}"))["data"]["produto"]["quantidade_atual"]
    assert depois_mover == antes_mover
    scan = assert_ok(client.get("/api/scanner/buscar/0300-2"))["data"]
    assert scan["tipo"] == "unidade"
    assert scan["unidade"]["status"] == "retirado"

    with get_db() as db:
        vinculadas = db.execute("SELECT COUNT(*) AS total FROM movimentacao_unidades").fetchone()["total"]
        assert vinculadas >= 4


def test_importacao_produtos():
    invalid = BytesIO(b"nao e excel")
    assert_error(api_upload("/api/importacao/produtos", {"arquivo": (invalid, "produtos.txt")}), 400)

    workbook = Workbook()
    sheet = workbook.active
    sheet.append([
        "nome",
        "categoria",
        "modelo",
        "codigo_barras",
        "quantidade_inicial",
        "estoque_minimo",
        "localizacao_codigo",
        "observacao",
    ])
    sheet.append(["SSD Importado", "SSD", "SATA 480GB", "", 5, 2, "ARM01-P3-SSDS", "Carga teste"])
    buffer = BytesIO()
    workbook.save(buffer)
    buffer.seek(0)

    response = api_upload("/api/importacao/produtos", {"arquivo": (buffer, "produtos.xlsx")})
    data = assert_ok(response)["data"]
    assert data["criados"] == 1
    assert data["erros"] == []

    produtos = assert_ok(client.get("/api/produtos?q=SSD%20Importado"))["data"]["produtos"]
    assert len(produtos) == 1
    assert produtos[0]["quantidade_atual"] == 5


def test_usuarios():
    response = api_post(
        "/api/usuarios",
        json={"nome": "João Silva", "usuario": "joao", "senha": "1234", "confirmar_senha": "1234", "ativo": True},
    )
    joao_id = assert_ok(response, 201)["data"]["id"]
    usuarios = assert_ok(client.get("/api/usuarios"))["data"]["usuarios"]
    assert any(user["usuario"] == "joao" for user in usuarios)

    login(username="joao", password="1234")
    assert_error(api_post("/api/usuarios", json={"nome": "Teste", "usuario": "teste", "senha": "1234", "confirmar_senha": "1234"}), 403)
    produto = assert_ok(api_post(
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
    assert_ok(api_post("/api/movimentacoes/retirada", json={"produto_id": produto["id"], "quantidade": 1, "entregue_para": "Joao"}))
    historico = assert_ok(client.get(f"/api/produtos/{produto['id']}"))["data"]["movimentacoes"]
    assert historico[0]["usuario_nome"] == "João Silva"

    login()
    assert_ok(api_post(f"/api/usuarios/{joao_id}/desativar", json={}))
    assert_error(client.post("/api/auth/login", json={"username": "joao", "password": "1234"}), 403)
    login()
    assert_ok(api_post(f"/api/usuarios/{joao_id}/resetar-senha", json={"senha": "5678", "confirmar_senha": "5678"}))
    assert_ok(api_post(f"/api/usuarios/{joao_id}/ativar", json={}))
    joao_client = app.test_client()
    login(joao_client, "joao", "5678")
    assert_ok(api_post(f"/api/usuarios/{joao_id}/desativar", json={}))
    assert_error(joao_client.get("/api/produtos"), 403)
    assert_ok(api_post(f"/api/usuarios/{joao_id}/ativar", json={}))
    login(username="joao", password="5678")
    assert_ok(client.get("/api/auth/me"))
    joao_client = app.test_client()
    login(joao_client, "joao", "5678")
    login()
    assert_ok(api_post(f"/api/usuarios/{joao_id}/desativar", json={}))
    assert_error(joao_client.get("/api/auth/me"), 403)

    login()
    assert_error(
        api_post("/api/usuarios", json={"nome": "João Silva 2", "usuario": "joao", "senha": "1234", "confirmar_senha": "1234"}),
        409,
    )
    assert_ok(api_post(f"/api/usuarios/{joao_id}/desativar", json={}))
    assert_error(api_post("/api/usuarios/1/desativar", json={}), 409)


def test_backup_database():
    backup_dir = Path(tempfile.mkdtemp())
    backup_path = backup_database(db_path, str(backup_dir), retention=2)
    assert backup_path and backup_path.exists()
    assert backup_path.stat().st_size > 0


if __name__ == "__main__":
    login()
    test_quantidade()
    test_unidade()
    test_importacao_produtos()
    test_usuarios()
    test_backup_database()
    print("Todos os fluxos principais passaram.")
