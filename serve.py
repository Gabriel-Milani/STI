import os

from dotenv import load_dotenv

from app import create_app

try:
    from waitress import serve
except ImportError as exc:
    raise SystemExit("Waitress não instalado. Rode: pip install -r requirements.txt") from exc


load_dotenv()
app = create_app()


if __name__ == "__main__":
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "5000"))
    threads = int(os.getenv("WAITRESS_THREADS", "8"))
    serve(app, host=host, port=port, threads=threads)
