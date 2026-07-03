from flask import Flask, jsonify, redirect, send_from_directory
from dotenv import load_dotenv
import os

from .database import init_db
from .logging_config import configure_logging
from .services.auth_utils import csrf_protect, login_required
from .routes.auth import auth_bp
from .routes.localizacoes import localizacoes_bp
from .routes.produtos import produtos_bp
from .routes.movimentacoes import movimentacoes_bp
from .routes.emprestimos import emprestimos_bp
from .routes.scanner import scanner_bp
from .routes.dashboard import dashboard_bp
from .routes.etiquetas import etiquetas_bp
from .routes.importacao import importacao_bp
from .routes.usuarios import usuarios_bp
from .routes.terminal import terminal_bp


def env_bool(name, default=False):
    value = os.getenv(name)
    if value is None:
        return default
    return value.lower() in ("1", "true", "yes", "on", "sim")


def create_app():
    load_dotenv()
    app = Flask(__name__)
    secret_key = os.getenv("SECRET_KEY")
    if not secret_key:
        raise RuntimeError("SECRET_KEY não configurada. Defina uma chave forte no arquivo .env.")
    app.config["SECRET_KEY"] = secret_key
    app.config["DATABASE_PATH"] = os.getenv("DATABASE_PATH", "estoque_v2.db")
    app.config["APP_BASE_URL"] = os.getenv("APP_BASE_URL", "http://127.0.0.1:5000")
    app.config["MAX_CONTENT_LENGTH"] = int(os.getenv("MAX_CONTENT_LENGTH", str(8 * 1024 * 1024)))
    app.config["LOG_LEVEL"] = os.getenv("LOG_LEVEL", "INFO")
    app.config["LOG_FILE"] = os.getenv("LOG_FILE")
    app.config["LOG_MAX_BYTES"] = int(os.getenv("LOG_MAX_BYTES", "1000000"))
    app.config["LOG_BACKUP_COUNT"] = int(os.getenv("LOG_BACKUP_COUNT", "5"))
    app.config["SESSION_COOKIE_HTTPONLY"] = True
    app.config["SESSION_COOKIE_SAMESITE"] = os.getenv("SESSION_COOKIE_SAMESITE", "Lax")
    app.config["SESSION_COOKIE_SECURE"] = env_bool(
        "SESSION_COOKIE_SECURE",
        os.getenv("FLASK_ENV") == "production",
    )

    configure_logging(app)
    init_db(app.config["DATABASE_PATH"])

    app.before_request(csrf_protect)

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(localizacoes_bp, url_prefix="/api/localizacoes")
    app.register_blueprint(produtos_bp, url_prefix="/api/produtos")
    app.register_blueprint(movimentacoes_bp, url_prefix="/api/movimentacoes")
    app.register_blueprint(emprestimos_bp, url_prefix="/api/emprestimos")
    app.register_blueprint(scanner_bp, url_prefix="/api/scanner")
    app.register_blueprint(dashboard_bp, url_prefix="/api/dashboard")
    app.register_blueprint(etiquetas_bp, url_prefix="/api/etiquetas")
    app.register_blueprint(importacao_bp, url_prefix="/api/importacao")
    app.register_blueprint(usuarios_bp, url_prefix="/api/usuarios")
    app.register_blueprint(terminal_bp, url_prefix="/api/terminal")

    @app.get("/api/health")
    def health():
        return jsonify({"ok": True, "message": "Estoque TI V2 API online"})

    @app.get("/")
    def home():
        return redirect("/dashboard")

    pages = {
        "/login": "login.html",
        "/dashboard": "dashboard.html",
        "/produtos": "produtos.html",
        "/produtos/novo": "produtos-novo.html",
        "/localizacoes": "localizacoes.html",
        "/etiquetas": "etiquetas.html",
        "/movimentacoes": "movimentacoes.html",
        "/emprestimos": "emprestimos.html",
        "/scanner": "scanner.html",
        "/importacao": "importacao.html",
        "/usuarios": "usuarios.html",
    }
    for route, filename in pages.items():
        app.add_url_rule(
            route,
            endpoint=f"page_{filename.replace('-', '_').replace('.', '_')}",
            view_func=lambda filename=filename: send_from_directory("frontend", filename),
        )

    @app.get("/terminal")
    def terminal_page():
        return send_from_directory("frontend", "terminal.html")

    @app.get("/produtos/<codigo>")
    def produto_detalhe_page(codigo):
        return send_from_directory("frontend", "produto-detalhe.html")

    @app.get("/assets/<path:filename>")
    def frontend_assets(filename):
        return send_from_directory("frontend/assets", filename, max_age=31536000)

    @app.errorhandler(404)
    def not_found(_):
        return jsonify({"ok": False, "error": "Rota não encontrada."}), 404

    @app.errorhandler(500)
    def server_error(err):
        app.logger.exception("Erro interno do servidor", exc_info=err)
        return jsonify({"ok": False, "error": "Erro interno do servidor."}), 500

    return app
