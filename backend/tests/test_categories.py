def test_list_departments(client, especialista_headers):
    r = client.get("/api/categories/department", headers=especialista_headers)
    assert r.status_code == 200
    codes = {c["code"] for c in r.json()}
    assert codes == {"PSI", "JUR", "TSO"}


def test_list_areas(client, especialista_headers):
    r = client.get("/api/categories/area", headers=especialista_headers)
    assert r.status_code == 200
    assert len(r.json()) == 4


def test_list_categories_requires_auth(client):
    r = client.get("/api/categories/department")
    assert r.status_code == 401


def test_create_category_requires_admin(client, orientador_headers):
    r = client.post(
        "/api/categories/area", json={"code": "NEW", "name": "Nueva área", "active": True}, headers=orientador_headers
    )
    assert r.status_code == 403


def test_create_category_success(client, admin_headers):
    r = client.post(
        "/api/categories/area", json={"code": "NEW", "name": "Nueva área", "active": True}, headers=admin_headers
    )
    assert r.status_code == 201
    assert r.json()["code"] == "NEW"


def test_create_category_duplicate_code(client, admin_headers):
    r = client.post(
        "/api/categories/department", json={"code": "psi", "name": "Duplicado", "active": True}, headers=admin_headers
    )
    assert r.status_code == 400


def test_update_category(client, admin_headers):
    r = client.put(
        "/api/categories/department/d1",
        json={"code": "PSI", "name": "Psicología clínica", "active": True},
        headers=admin_headers,
    )
    assert r.status_code == 200
    assert r.json()["name"] == "Psicología clínica"


def test_update_category_not_found(client, admin_headers):
    r = client.put(
        "/api/categories/department/nope",
        json={"code": "XXX", "name": "No existe", "active": True},
        headers=admin_headers,
    )
    assert r.status_code == 404


def test_category_usage(client, admin_headers):
    r = client.get("/api/categories/department/d1/usage", headers=admin_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["specialists"] >= 1
    assert body["pendingAppointments"] == 0
