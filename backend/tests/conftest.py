import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.seed import seed_store
from app.store import Store, get_store


@pytest.fixture
def store() -> Store:
    s = Store()
    seed_store(s)
    return s


@pytest.fixture
def client(store: Store) -> TestClient:
    app.dependency_overrides[get_store] = lambda: store
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
