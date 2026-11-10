import os

# Never touch the real database from tests: the app's own engine (used only by the
# startup hook here) points at a throwaway in-memory DB without demo data.
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["SEED_DEMO_DATA"] = "false"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.orm import Session, sessionmaker  # noqa: E402

from app.db import create_schema, make_engine  # noqa: E402
from app.main import app  # noqa: E402
from app.seed import seed_database  # noqa: E402
from app.tables import Base  # noqa: E402
from app.store import get_store, store_session  # noqa: E402


@pytest.fixture
def session_factory() -> sessionmaker[Session]:
    """A fresh, seeded in-memory database per test."""
    engine = make_engine(os.environ.get("TEST_DATABASE_URL", "sqlite://"))
    create_schema(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session, session.begin():
        seed_database(session)
    yield factory
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture
def db(session_factory: sessionmaker[Session]) -> Session:
    """Direct DB access for arranging/inspecting state; commit to make changes visible to the API."""
    with session_factory() as session:
        yield session


@pytest.fixture
def client(session_factory: sessionmaker[Session]) -> TestClient:
    def override_store():
        yield from store_session(session_factory)

    app.dependency_overrides[get_store] = override_store
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def auth_headers(client: TestClient, username: str, password: str) -> dict[str, str]:
    r = client.post("/api/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture
def admin_headers(client: TestClient) -> dict[str, str]:
    return auth_headers(client, "admin", "admin123")


@pytest.fixture
def orientador_headers(client: TestClient) -> dict[str, str]:
    return auth_headers(client, "orientador", "orientador123")


@pytest.fixture
def especialista_headers(client: TestClient) -> dict[str, str]:
    return auth_headers(client, "especialista", "especialista123")
