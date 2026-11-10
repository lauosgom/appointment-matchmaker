from app.store import MAX_FAILED_ATTEMPTS


def test_login_success_returns_user_and_token(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert r.status_code == 200
    body = r.json()
    assert body["user"]["username"] == "admin"
    assert body["user"]["role"] == "admin"
    assert "password" not in body["user"]
    assert "password_hash" not in body["user"]
    assert body["token"]

    # token actually works for a protected endpoint
    r = client.get("/api/users", headers={"Authorization": f"Bearer {body['token']}"})
    assert r.status_code == 200


def test_login_wrong_password(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "wrong"})
    assert r.status_code == 401
    assert "message" in r.json()


def test_login_unknown_user(client):
    r = client.post("/api/auth/login", json={"username": "nope", "password": "whatever"})
    assert r.status_code == 401


def test_login_locks_after_max_failed_attempts(client):
    for _ in range(MAX_FAILED_ATTEMPTS - 1):
        r = client.post("/api/auth/login", json={"username": "admin", "password": "wrong"})
        assert r.status_code == 401

    # the attempt that reaches the threshold locks the account immediately
    r = client.post("/api/auth/login", json={"username": "admin", "password": "wrong"})
    assert r.status_code == 429

    # even the correct password is rejected while locked
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert r.status_code == 429


def test_login_disabled_account(client, store, admin_headers):
    client.put(
        "/api/users/u2",
        json={
            "username": "orientador",
            "fullName": "Óscar Orientador",
            "email": "orientador@telefono.org",
            "role": "orientador",
            "active": False,
        },
        headers=admin_headers,
    )
    r = client.post("/api/auth/login", json={"username": "orientador", "password": "orientador123"})
    assert r.status_code == 401


def test_password_reset_flow(client, store):
    r = client.post("/api/auth/password-reset/request", json={"email": "admin@telefono.org"})
    assert r.status_code == 200
    token = r.json()["demoToken"]
    assert token

    r = client.post("/api/auth/password-reset/confirm", json={"token": token, "newPassword": "newpass123"})
    assert r.status_code == 204

    # old password no longer works, new one does
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert r.status_code == 401
    r = client.post("/api/auth/login", json={"username": "admin", "password": "newpass123"})
    assert r.status_code == 200

    # token is single-use
    r = client.post("/api/auth/password-reset/confirm", json={"token": token, "newPassword": "another123"})
    assert r.status_code == 400


def test_password_reset_request_unknown_email_does_not_leak(client):
    r = client.post("/api/auth/password-reset/request", json={"email": "unknown@telefono.org"})
    assert r.status_code == 200
    assert r.json()["demoToken"] is None


def test_password_reset_confirm_invalid_token(client):
    r = client.post("/api/auth/password-reset/confirm", json={"token": "bogus", "newPassword": "newpass123"})
    assert r.status_code == 400


def test_password_reset_confirm_password_too_short(client):
    r = client.post("/api/auth/password-reset/request", json={"email": "admin@telefono.org"})
    token = r.json()["demoToken"]
    r = client.post("/api/auth/password-reset/confirm", json={"token": token, "newPassword": "short"})
    assert r.status_code == 422  # pydantic min_length rejects it before the store ever sees it
