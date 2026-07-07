import os

from app import create_app
from app.database import get_db


def test_terminal_status_and_scan_route(tmp_path):
    db_path = tmp_path / "terminal_test.db"
    os.environ["DATABASE_PATH"] = str(db_path)
    os.environ["SECRET_KEY"] = "test-secret"

    app = create_app()
    client = app.test_client()

    # Ensure unauthenticated request returns 401
    unauth_status = client.get("/api/terminal/status")
    assert unauth_status.status_code == 401

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

    # Ensure authenticated request returns 200 and lists active users
    status_response = client.get("/api/terminal/status")
    assert status_response.status_code == 200
    status_data = status_response.get_json()["data"]
    assert status_data["online"] is True
    assert len(status_data["usuarios_ativos"]) > 0
    assert any(u["username"] == "admin" for u in status_data["usuarios_ativos"])

    terminal_page_response = client.get("/terminal")
    assert terminal_page_response.status_code == 200

    # Ensure scan resolves correctly
    scan_response = client.get("/api/terminal/scan/P00001")
    assert scan_response.status_code == 200
    payload = scan_response.get_json()
    assert payload["data"]["tipo"] == "produto"
    assert payload["data"]["produto"]["codigo"] == "P00001"
    assert payload["data"]["produto"]["emprestimo_ativo"] is None

    # Let's perform a loan (emprestimo) and verify the scan returns active loan info
    loan_response = client.post(
        "/api/terminal/action",
        json={
            "action": "emprestar",
            "codigo": "P00001",
            "usuario": "Maria Silva",
            "data_prevista": "2026-07-15",
            "observacao": "Uso temporário"
        }
    )
    assert loan_response.status_code == 200
    assert loan_response.get_json()["ok"] is True

    # Scan again and check that active loan is returned
    scan_response_2 = client.get("/api/terminal/scan/P00001")
    assert scan_response_2.status_code == 200
    payload_2 = scan_response_2.get_json()
    assert payload_2["data"]["produto"]["emprestimo_ativo"] is not None
    assert payload_2["data"]["produto"]["emprestimo_ativo"]["emprestado_para"] == "Maria Silva"
    assert payload_2["data"]["produto"]["emprestimo_ativo"]["status"] == "aberto"
