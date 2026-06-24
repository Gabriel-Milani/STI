import argparse
import os

from dotenv import load_dotenv

from app import create_app
from app.database import backup_database


def backup_db(_args):
    load_dotenv()
    db_path = os.getenv("DATABASE_PATH", "estoque_v2.db")
    backup_dir = os.getenv("DB_BACKUP_DIR", "backups")
    retention = int(os.getenv("DB_BACKUP_RETENTION", "20"))
    backup_path = backup_database(db_path, backup_dir, retention)
    if not backup_path:
        print("Nenhum backup criado: banco inexistente, vazio ou em memória.")
        return 1
    print(f"Backup criado: {backup_path}")
    return 0


def check_config(_args):
    app = create_app()
    print("Configuração carregada com sucesso.")
    print(f"DATABASE_PATH={app.config['DATABASE_PATH']}")
    print(f"SESSION_COOKIE_SECURE={app.config['SESSION_COOKIE_SECURE']}")
    print(f"SESSION_COOKIE_SAMESITE={app.config['SESSION_COOKIE_SAMESITE']}")
    print(f"MAX_CONTENT_LENGTH={app.config['MAX_CONTENT_LENGTH']}")
    print(f"LOG_LEVEL={app.config['LOG_LEVEL']}")
    print(f"LOG_FILE={app.config['LOG_FILE'] or '-'}")
    return 0


def main():
    parser = argparse.ArgumentParser(description="Comandos operacionais do Estoque TI.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    backup_parser = subparsers.add_parser("backup-db", help="Cria backup manual do banco SQLite.")
    backup_parser.set_defaults(func=backup_db)

    check_parser = subparsers.add_parser("check-config", help="Valida e exibe configuração efetiva.")
    check_parser.set_defaults(func=check_config)

    args = parser.parse_args()
    raise SystemExit(args.func(args))


if __name__ == "__main__":
    main()
