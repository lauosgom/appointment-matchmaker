def test_list_specialists(client, especialista_headers):
    r = client.get("/api/specialists", headers=especialista_headers)
    assert r.status_code == 200
    assert len(r.json()) == 4


def test_create_specialist_requires_admin(client, orientador_headers):
    r = client.post(
        "/api/specialists",
        json={"code": "ESP-999", "fullName": "Nuevo Especialista", "departmentIds": ["d1"], "areaIds": [], "active": True},
        headers=orientador_headers,
    )
    assert r.status_code == 403


def test_create_specialist_success(client, admin_headers):
    r = client.post(
        "/api/specialists",
        json={"code": "ESP-999", "fullName": "Nuevo Especialista", "departmentIds": ["d1"], "areaIds": [], "active": True},
        headers=admin_headers,
    )
    assert r.status_code == 201
    assert r.json()["code"] == "ESP-999"


def test_create_specialist_duplicate_code(client, admin_headers):
    r = client.post(
        "/api/specialists",
        json={"code": "esp-001", "fullName": "Duplicado", "departmentIds": [], "areaIds": [], "active": True},
        headers=admin_headers,
    )
    assert r.status_code == 400


def test_update_specialist_not_found(client, admin_headers):
    r = client.put(
        "/api/specialists/nope",
        json={"code": "X", "fullName": "X", "departmentIds": [], "areaIds": [], "active": True},
        headers=admin_headers,
    )
    assert r.status_code == 404


def test_update_specialist_success(client, admin_headers):
    r = client.put(
        "/api/specialists/s1",
        json={
            "code": "ESP-001",
            "fullName": "Dra. Marta Restrepo Actualizada",
            "departmentIds": ["d1"],
            "areaIds": ["a1"],
            "active": True,
        },
        headers=admin_headers,
    )
    assert r.status_code == 200
    assert r.json()["fullName"] == "Dra. Marta Restrepo Actualizada"


def test_pending_appointments_count_starts_at_zero(client, admin_headers):
    r = client.get("/api/specialists/s1/pending-appointments", headers=admin_headers)
    assert r.status_code == 200
    assert r.json() == {"count": 0}
