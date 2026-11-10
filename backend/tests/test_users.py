def test_list_users_requires_admin(client, orientador_headers):
    r = client.get("/api/users", headers=orientador_headers)
    assert r.status_code == 403


def test_list_users_as_admin(client, admin_headers):
    r = client.get("/api/users", headers=admin_headers)
    assert r.status_code == 200
    usernames = {u["username"] for u in r.json()}
    assert usernames == {"admin", "orientador", "especialista"}


def test_list_users_requires_auth(client):
    r = client.get("/api/users")
    assert r.status_code == 401


def test_user_names_available_to_any_authenticated_role(client, especialista_headers):
    r = client.get("/api/users/names", headers=especialista_headers)
    assert r.status_code == 200
    assert r.json()["u1"] == "Ana Administradora"


def test_get_user_by_id(client, admin_headers):
    r = client.get("/api/users/u1", headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["username"] == "admin"


def test_get_user_not_found(client, admin_headers):
    r = client.get("/api/users/nope", headers=admin_headers)
    assert r.status_code == 404


def test_create_user_requires_admin(client, orientador_headers):
    r = client.post(
        "/api/users",
        json={
            "username": "nuevo",
            "fullName": "Nuevo Usuario",
            "email": "nuevo@telefono.org",
            "role": "orientador",
            "active": True,
            "password": "secret123",
        },
        headers=orientador_headers,
    )
    assert r.status_code == 403


def test_create_user_success(client, admin_headers):
    r = client.post(
        "/api/users",
        json={
            "username": "nuevo",
            "fullName": "Nuevo Usuario",
            "email": "nuevo@telefono.org",
            "role": "orientador",
            "active": True,
            "password": "secret123",
        },
        headers=admin_headers,
    )
    assert r.status_code == 201
    body = r.json()
    assert body["username"] == "nuevo"
    assert "password" not in body

    # the new user can log in with the password that was set
    r = client.post("/api/auth/login", json={"username": "nuevo", "password": "secret123"})
    assert r.status_code == 200


def test_create_user_duplicate_username(client, admin_headers):
    r = client.post(
        "/api/users",
        json={
            "username": "admin",
            "fullName": "Otro Admin",
            "email": "otro@telefono.org",
            "role": "admin",
            "active": True,
            "password": "secret123",
        },
        headers=admin_headers,
    )
    assert r.status_code == 400


def test_create_user_password_too_short(client, admin_headers):
    r = client.post(
        "/api/users",
        json={
            "username": "nuevo2",
            "fullName": "Nuevo Usuario",
            "email": "nuevo2@telefono.org",
            "role": "orientador",
            "active": True,
            "password": "abc",
        },
        headers=admin_headers,
    )
    assert r.status_code == 400


def test_create_especialista_user_requires_specialist_id(client, admin_headers):
    r = client.post(
        "/api/users",
        json={
            "username": "esp2",
            "fullName": "Especialista Dos",
            "email": "esp2@telefono.org",
            "role": "especialista",
            "active": True,
            "password": "secret123",
        },
        headers=admin_headers,
    )
    assert r.status_code == 400


def test_update_user_cannot_deactivate_self(client, admin_headers):
    r = client.put(
        "/api/users/u1",
        json={
            "username": "admin",
            "fullName": "Ana Administradora",
            "email": "admin@telefono.org",
            "role": "admin",
            "active": False,
        },
        headers=admin_headers,
    )
    assert r.status_code == 400


def test_update_user_not_found(client, admin_headers):
    r = client.put(
        "/api/users/nope",
        json={
            "username": "whoever",
            "fullName": "Whoever",
            "email": "whoever@telefono.org",
            "role": "orientador",
            "active": True,
        },
        headers=admin_headers,
    )
    assert r.status_code == 404


def test_update_user_changes_password(client, admin_headers):
    r = client.put(
        "/api/users/u2",
        json={
            "username": "orientador",
            "fullName": "Óscar Orientador",
            "email": "orientador@telefono.org",
            "role": "orientador",
            "active": True,
            "password": "brandnew123",
        },
        headers=admin_headers,
    )
    assert r.status_code == 200

    r = client.post("/api/auth/login", json={"username": "orientador", "password": "brandnew123"})
    assert r.status_code == 200
