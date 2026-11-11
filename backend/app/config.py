"""Runtime configuration read from environment variables."""

from __future__ import annotations

import os
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parent.parent

DEFAULT_DATABASE_URL = f"sqlite:///{_BACKEND_DIR / 'appointments.db'}"


def database_url() -> str:
    """SQLAlchemy URL of the database to use, e.g.

    - sqlite:///./appointments.db  (default: backend/appointments.db)
    - postgresql+psycopg://user:pass@host:5432/appointments
    """
    return os.environ.get("DATABASE_URL") or DEFAULT_DATABASE_URL


def seed_demo_data() -> bool:
    """Load demo users/catalogs/slots into an empty database on startup (default: on)."""
    return os.environ.get("SEED_DEMO_DATA", "true").strip().lower() not in ("0", "false", "no", "off")


def frontend_dir() -> Path | None:
    """Directory with the built frontend (index.html + assets) to serve at "/", if any.

    Set FRONTEND_DIR to enable it (the Docker image does). Unset or missing → API only.
    """
    value = os.environ.get("FRONTEND_DIR")
    if not value:
        return None
    path = Path(value).resolve()
    return path if (path / "index.html").is_file() else None
