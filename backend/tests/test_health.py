from types import SimpleNamespace

from app.main import app
from app.store import get_store


def test_health_is_public_and_ok(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_health_reports_503_when_the_database_fails(client):
    def broken(*_a, **_k):
        raise RuntimeError("db down")

    app.dependency_overrides[get_store] = lambda: SimpleNamespace(session=SimpleNamespace(execute=broken))
    r = client.get("/api/health")
    assert r.status_code == 503
    assert r.json() == {"status": "unavailable"}
