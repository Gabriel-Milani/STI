import os
import tempfile
from io import BytesIO

from openpyxl import Workbook


fd, db_path = tempfile.mkstemp(suffix=".db")
os.close(fd)
os.unlink(db_path)
os.environ["DATABASE_PATH"] = db_path

from app import create_app  # noqa: E402
from app.database import get_db  # noqa: E402


app = create_app()
client = app.test_client()


<<<<<<< HEAD
r = client.post('/api/produtos', json={
    'nome': 'Mouse Logitech M90',
    'categoria': 'Mouse',
    'modelo': 'M90',
    'quantidade_inicial': 10,
    'estoque_minimo': 2,
    'localizacao_codigo': 'ARM01-P4-MOUSE'
})
print('criar produto', r.status_code, r.json)
produto_id = r.json['data']['id']
codigo = r.json['data']['codigo']
=======
def assert_ok(response, status=200):
    assert response.status_code == status, (response.status_code, response.json)
    assert response.json["ok"] is True, response.json
    return response.json
>>>>>>> c8da6591bc55c3ea4cf2766c27e532b7609c9962


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
            "marca": "Implastec",
            "modelo": "LC-300",
            "quantidade_inicial": 3,
            "estoque_minimo": 1,
            "localizacao_codigo": "ARM01-P1-LIMPEZA",
        },
    )
    data = assert_ok(response, 201)["data"]
    produto_id = data["id"]

    assert_ok(client.get("/api/produtos?q=LC-300"))
    assert_ok(client.post("/api/movimentacoes/entrada", json={"produto_id": produto_id, "quantidade": 2}))
    assert_ok(
        client.post(
            "/api/movimentacoes/retirada",
            json={"produto_id": produto_id, "quantidade": 1, "entregue_para": "Joao"},
        )
    )
    assert_error(
        client.post(
            "/api/movimentacoes/retirada",
            json={"produto_id": produto_id, "quantidade": 10, "entregue_para": "Joao"},
        ),
        409,
    )
    detalhe = assert_ok(client.get(f"/api/produtos/{produto_id}"))["data"]["produto"]
    assert detalhe["quantidade_atual"] == 4
    assert detalhe["codigo_barras"].startswith("P")
    assert_error(client.delete(f"/api/produtos/{produto_id}"), 409)

    assert_ok(client.put(f"/api/produtos/{produto_id}", json={"nome": "Limpa contato", "codigo_barras": ""}))
    detalhe = assert_ok(client.get(f"/api/produtos/{produto_id}"))["data"]["produto"]
    assert detalhe["codigo_barras"].startswith("P")


def test_unidade():
    response = client.post(
        "/api/produtos",
        json={
            "nome": "Mouse-Novo",
            "categoria": "Mouse",
            "marca": "Dell",
            "modelo": "MN-1",
            "tipo_controle": "unidade",
            "prefixo_rastreio": "0300",
            "quantidade_inicial": 2,
            "estoque_minimo": 1,
            "localizacao_codigo": "ARM01-P4-MOUSE",
        },
    )
    produto_id = assert_ok(response, 201)["data"]["id"]
    detalhe = assert_ok(client.get(f"/api/produtos/{produto_id}"))["data"]
    assert [u["codigo_unidade"] for u in detalhe["unidades"]] == ["0300-1", "0300-2"]

    assert_ok(client.post("/api/movimentacoes/entrada", json={"produto_id": produto_id, "quantidade": 1}))
    assert_ok(
        client.post(
            "/api/movimentacoes/retirada",
            json={"produto_id": produto_id, "quantidade": 1, "entregue_para": "Maria"},
        )
    )
    scan = assert_ok(client.get("/api/scanner/buscar/0300-1"))["data"]
    assert scan["tipo"] == "unidade"
    assert scan["unidade"]["status"] == "retirado"

    with get_db() as db:
        vinculadas = db.execute("SELECT COUNT(*) AS total FROM movimentacao_unidades").fetchone()["total"]
        assert vinculadas >= 4


def test_importacao_unidade():
    wb = Workbook()
    ws = wb.active
    ws.append(
        [
            "nome",
            "categoria",
            "marca",
            "modelo",
            "codigo_barras",
            "quantidade_inicial",
            "estoque_minimo",
            "localizacao_codigo",
            "observacao",
            "tipo_controle",
            "prefixo_rastreio",
        ]
    )
    ws.append(["Teclado-Novo", "Teclado", "Dell", "TK-1", "", 2, 1, "ARM01-P6-TECLADOS", "", "unidade", "0400"])
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)

    response = client.post(
        "/api/importacao/produtos",
        data={"arquivo": (buf, "produtos.xlsx")},
        content_type="multipart/form-data",
    )
    payload = assert_ok(response)["data"]
    assert payload["criados"] == 1
    assert payload["erros"] == []
    scan = assert_ok(client.get("/api/scanner/buscar/0400-1"))["data"]
    assert scan["tipo"] == "unidade"


if __name__ == "__main__":
    login()
    test_quantidade()
    test_unidade()
    test_importacao_unidade()
    print("Todos os fluxos principais passaram.")
