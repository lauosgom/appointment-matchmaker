"""End-to-end against a real database file via DATABASE_URL (no dependency overrides)."""

import pytest
from fastapi.testclient import TestClient

from app import db
from app.main import app


@pytest.fixture
def file_db(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'test.db'}")
    monkeypatch.setenv("SEED_DEMO_DATA", "true")
    db.reset_engine()
    yield tmp_path / "test.db"
    db.reset_engine()


def login(client: TestClient) -> dict[str, str]:
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_data_survives_restart(file_db):
    with TestClient(app) as client:
        headers = login(client)
        r = client.post(
            "/api/categories/department",
            json={"code": "PER", "name": "Persistente", "active": True},
            headers=headers,
        )
        assert r.status_code == 201
    assert file_db.exists()

    db.reset_engine()  # simulate a server restart
    with TestClient(app) as client:
        # the session token was persisted too
        r = client.get("/api/categories/department", headers=headers)
        assert r.status_code == 200
        codes = [c["code"] for c in r.json()]
        assert codes == ["PSI", "JUR", "TSO", "PER"]  # seeded once, not re-seeded; creation order kept


def test_seed_can_be_disabled(file_db, monkeypatch):
    monkeypatch.setenv("SEED_DEMO_DATA", "false")
    with TestClient(app) as client:
        r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
        assert r.status_code == 401


def test_failed_logins_persist_across_requests(file_db):
    with TestClient(app) as client:
        for _ in range(3):
            client.post("/api/auth/login", json={"username": "admin", "password": "wrong"})
        r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
        assert r.status_code == 429
