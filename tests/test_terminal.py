import os

from app import create_app
from app.database import get_db


def test_terminal_status_and_scan_route(tmp_path):
    db_path = tmp_path / "terminal_test.db"
    os.environ["DATABASE_PATH"] = str(db_path)
    os.environ["SECRET_KEY"] = "test-secret"

    app = create_app()
    client = app.test_client()

    with get_db() as db:
        db.execute(
            "INSERT INTO localizacoes (codigo, nome, descricao, armario, prateleira, ordem, ativo) VALUES (?, ?, ?, ?, ?, ?, 1)",
            ("LOC-01", "Local Teste", "Local para teste", "ARM01", "P1", 1),
        )
        db.execute(
            "INSERT INTO produtos (codigo, nome, categoria, modelo, codigo_barras, quantidade_atual, estoque_minimo, localizacao_id, ativo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)",
            ("P00001", "Teclado Teste", "Periféricos", "TK-01", "P0000001", 2, 1, 1),
        )
        db.commit()

    login_response = client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "admin123"},
    )
    assert login_response.status_code == 200

    status_response = client.get("/api/terminal/status")
    assert status_response.status_code == 200
    assert status_response.get_json()["data"]["online"] is True

    terminal_page_response = client.get("/terminal")
    assert terminal_page_response.status_code == 200

    scan_response = client.get("/api/terminal/scan/P00001")
    assert scan_response.status_code == 200
    payload = scan_response.get_json()
    assert payload["data"]["tipo"] == "produto"
    assert payload["data"]["produto"]["codigo"] == "P00001"
