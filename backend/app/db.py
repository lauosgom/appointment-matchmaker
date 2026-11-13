"""Engine/session setup. The only place that knows which database backend is in use.

Everything else talks to SQLAlchemy through portable constructs (see tables.py),
so switching backends is a matter of setting DATABASE_URL and installing the driver.
"""

from __future__ import annotations

import logging

from sqlalchemy import Engine, create_engine, event, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from . import config
from .tables import Base, PasswordResetTokenRow

log = logging.getLogger(__name__)


def make_engine(url: str) -> Engine:
    parsed = make_url(url)
    kwargs: dict = {}
    if parsed.get_backend_name() == "sqlite":
        # FastAPI runs sync endpoints in a thread pool.
        kwargs["connect_args"] = {"check_same_thread": False}
        if parsed.database in (None, "", ":memory:"):
            # A single shared connection, otherwise every connection gets its own empty DB.
            kwargs["poolclass"] = StaticPool
    else:
        kwargs["pool_pre_ping"] = True

    engine = create_engine(url, **kwargs)

    if parsed.get_backend_name() == "sqlite":

        @event.listens_for(engine, "connect")
        def _enable_sqlite_foreign_keys(dbapi_connection, _record) -> None:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return engine


def create_schema(engine: Engine) -> None:
    """Create missing tables, then bring tables from older versions up to date."""
    Base.metadata.create_all(engine)
    _upgrade_schema(engine)


def _upgrade_schema(engine: Engine) -> None:
    """Small, idempotent upgrades for databases created by earlier versions.

    `create_all` only creates missing tables; it never adds columns or indexes
    to tables that already exist.
    """
    columns = {c["name"] for c in inspect(engine).get_columns("password_reset_tokens")}
    if "expires_at" not in columns:
        column = PasswordResetTokenRow.__table__.c.expires_at
        with engine.begin() as conn:
            conn.execute(text(f"ALTER TABLE password_reset_tokens ADD COLUMN expires_at {column.type.compile(engine.dialect)}"))
            # Old rows hold plain tokens with no expiry: drop them, users can ask for a new link.
            conn.execute(text("DELETE FROM password_reset_tokens"))

    for table in Base.metadata.sorted_tables:
        for index in table.indexes:
            try:
                index.create(engine, checkfirst=True)
            except IntegrityError:
                # Existing rows break a unique index (e.g. a slot booked twice before
                # the index existed). Start anyway, but say loudly what to clean up.
                log.error(
                    "Could not create index %s on %s: existing rows violate it. "
                    "Fix the duplicates and restart to enable the protection.",
                    index.name,
                    table.name,
                )


_engine: Engine | None = None
_session_factory: sessionmaker[Session] | None = None


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        _engine = make_engine(config.database_url())
    return _engine


def get_session_factory() -> sessionmaker[Session]:
    global _session_factory
    if _session_factory is None:
        _session_factory = sessionmaker(bind=get_engine(), expire_on_commit=False)
    return _session_factory


def reset_engine() -> None:
    """Dispose the cached engine so the next use re-reads DATABASE_URL (tests, reconfiguration)."""
    global _engine, _session_factory
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _session_factory = None
