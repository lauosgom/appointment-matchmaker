"""Engine/session setup. The only place that knows which database backend is in use.

Everything else talks to SQLAlchemy through portable constructs (see tables.py),
so switching backends is a matter of setting DATABASE_URL and installing the driver.
"""

from __future__ import annotations

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from . import config
from .tables import Base


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
    Base.metadata.create_all(engine)


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
