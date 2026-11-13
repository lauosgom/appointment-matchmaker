"""Runtime configuration read from environment variables."""

from __future__ import annotations

import os
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parent.parent

DEFAULT_DATABASE_URL = f"sqlite:///{_BACKEND_DIR / 'appointments.db'}"


def normalize_database_url(url: str) -> str:
    """Point plain PostgreSQL URLs at the installed psycopg (v3) driver.

    SQLAlchemy maps `postgresql://` to psycopg2, and `postgres://` (common in
    hosting providers' connection strings) isn't recognised at all.
    """
    for prefix in ("postgresql://", "postgres://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix) :]
    return url


def database_url() -> str:
    """SQLAlchemy URL of the database to use, e.g.

    - sqlite:///./appointments.db  (default: backend/appointments.db)
    - postgresql://user:pass@host:5432/appointments  (uses psycopg)
    """
    return normalize_database_url(os.environ.get("DATABASE_URL") or DEFAULT_DATABASE_URL)


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


def app_base_url() -> str:
    """Public URL of the app, used to build links in emails (APP_BASE_URL).

    Configured rather than taken from the request's Host header, which a client
    controls: a forged Host would put an attacker's link in the reset email.
    """
    return (os.environ.get("APP_BASE_URL") or "http://localhost:8000").rstrip("/")


def _flag(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in ("1", "true", "yes", "on")


class SmtpSettings:
    """Outgoing mail server, from SMTP_* variables. No SMTP_HOST → mail is only logged."""

    def __init__(self) -> None:
        self.host = os.environ.get("SMTP_HOST", "").strip()
        self.security = os.environ.get("SMTP_SECURITY", "starttls").strip().lower()  # starttls | ssl | none
        default_port = {"ssl": 465, "none": 25}.get(self.security, 587)
        self.port = int(os.environ.get("SMTP_PORT") or default_port)
        self.username = os.environ.get("SMTP_USERNAME", "")
        self.password = os.environ.get("SMTP_PASSWORD", "")
        self.sender = os.environ.get("MAIL_FROM", "Citas con especialistas <no-reply@localhost>")
        self.timeout = float(os.environ.get("SMTP_TIMEOUT", "10"))
        if self.security not in ("starttls", "ssl", "none"):
            raise ValueError("SMTP_SECURITY must be starttls, ssl or none")


def smtp_settings() -> SmtpSettings:
    return SmtpSettings()


def mail_send_inline() -> bool:
    """Send emails before answering the request instead of in the background.

    Needed on hosts that throttle CPU once a response is sent (Cloud Run with
    request-based billing), where a background send may never finish.
    """
    return _flag("MAIL_SEND_INLINE")
