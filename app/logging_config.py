import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path


def configure_logging(app):
    log_level = app.config.get("LOG_LEVEL", "INFO").upper()
    log_file = app.config.get("LOG_FILE")
    formatter = logging.Formatter(
        "%(asctime)s %(levelname)s [%(name)s] %(message)s"
    )

    root = logging.getLogger()
    root.setLevel(log_level)

    for handler in root.handlers:
        handler.setLevel(log_level)
        handler.setFormatter(formatter)

    if log_file:
        path = Path(log_file)
        path.parent.mkdir(parents=True, exist_ok=True)
        target_path = str(path.resolve())
        has_handler = any(
            isinstance(handler, RotatingFileHandler)
            and getattr(handler, "baseFilename", None) == target_path
            for handler in root.handlers
        )
        if not has_handler:
            file_handler = RotatingFileHandler(
                path,
                maxBytes=app.config.get("LOG_MAX_BYTES", 1_000_000),
                backupCount=app.config.get("LOG_BACKUP_COUNT", 5),
                encoding="utf-8",
            )
            file_handler.setLevel(log_level)
            file_handler.setFormatter(formatter)
            root.addHandler(file_handler)

    app.logger.setLevel(log_level)
