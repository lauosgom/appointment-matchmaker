import re
from datetime import datetime, timedelta, timezone
from urllib.parse import unquote

import pytest
from sqlalchemy import select, update

from app import mailer
from app.store import MAX_FAILED_ATTEMPTS
from app.tables import PasswordResetTokenRow
from tests.conftest import auth_headers


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


def test_login_disabled_account(client, admin_headers):
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


@pytest.fixture
def outbox(monkeypatch):
    """Captures emails instead of sending them."""
    sent: list[dict[str, str]] = []
    monkeypatch.setattr(mailer, "send_email", lambda to, subject, body: sent.append({"to": to, "subject": subject, "body": body}))
    return sent


def reset_token_from(email: dict[str, str]) -> str:
    match = re.search(r"https?://\S+/restablecer\?token=(\S+)", email["body"])
    assert match, email["body"]
    return unquote(match.group(1))


def test_password_reset_flow(client, outbox, monkeypatch):
    monkeypatch.setenv("APP_BASE_URL", "https://citas.example.org/")
    session = auth_headers(client, "admin", "admin123")

    r = client.post("/api/auth/password-reset/request", json={"email": "admin@telefono.org"})
    assert r.status_code == 204
    assert r.content == b""  # the token is never in the response

    assert len(outbox) == 1
    assert outbox[0]["to"] == "admin@telefono.org"
    assert "https://citas.example.org/restablecer?token=" in outbox[0]["body"]
    token = reset_token_from(outbox[0])

    r = client.post("/api/auth/password-reset/confirm", json={"token": token, "newPassword": "newpass123"})
    assert r.status_code == 204

    # old password no longer works, new one does
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert r.status_code == 401
    r = client.post("/api/auth/login", json={"username": "admin", "password": "newpass123"})
    assert r.status_code == 200

    # sessions opened before the reset are closed
    assert client.get("/api/users", headers=session).status_code == 401

    # token is single-use
    r = client.post("/api/auth/password-reset/confirm", json={"token": token, "newPassword": "another123"})
    assert r.status_code == 400


def test_password_reset_request_unknown_email_does_not_leak(client, outbox):
    r = client.post("/api/auth/password-reset/request", json={"email": "unknown@telefono.org"})
    assert r.status_code == 204
    assert r.content == b""
    assert outbox == []


def test_password_reset_token_is_stored_hashed(client, outbox, db):
    client.post("/api/auth/password-reset/request", json={"email": "admin@telefono.org"})
    token = reset_token_from(outbox[0])
    stored = db.scalars(select(PasswordResetTokenRow.token)).all()
    assert stored and token not in stored


def test_password_reset_link_expires(client, outbox, db):
    client.post("/api/auth/password-reset/request", json={"email": "admin@telefono.org"})
    token = reset_token_from(outbox[0])
    db.execute(update(PasswordResetTokenRow).values(expires_at=datetime.now(timezone.utc) - timedelta(seconds=1)))
    db.commit()
    r = client.post("/api/auth/password-reset/confirm", json={"token": token, "newPassword": "newpass123"})
    assert r.status_code == 400
    assert "venció" in r.json()["message"]
    assert client.post("/api/auth/login", json={"username": "admin", "password": "admin123"}).status_code == 200


def test_password_reset_confirm_invalid_token(client):
    r = client.post("/api/auth/password-reset/confirm", json={"token": "bogus", "newPassword": "newpass123"})
    assert r.status_code == 400


def test_password_reset_confirm_password_too_short(client, outbox):
    client.post("/api/auth/password-reset/request", json={"email": "admin@telefono.org"})
    token = reset_token_from(outbox[0])
    r = client.post("/api/auth/password-reset/confirm", json={"token": token, "newPassword": "short"})
    assert r.status_code == 422  # pydantic min_length rejects it before the store ever sees it


def test_logout_ends_the_session(client):
    headers = auth_headers(client, "orientador", "orientador123")
    other = auth_headers(client, "orientador", "orientador123")
    assert client.post("/api/auth/logout", headers=headers).status_code == 204
    assert client.get("/api/assignments", headers=headers).status_code == 401
    # only that session: another login of the same user still works
    assert client.get("/api/assignments", headers=other).status_code == 200


def test_logout_requires_a_session(client):
    assert client.post("/api/auth/logout").status_code == 401


def test_inline_mode_sends_before_answering_with_constant_timing(client, outbox, monkeypatch):
    import app.routers.auth as auth_router

    monkeypatch.setenv("MAIL_SEND_INLINE", "true")
    slept: list[float] = []
    monkeypatch.setattr(auth_router.time, "sleep", slept.append)

    r = client.post("/api/auth/password-reset/request", json={"email": "admin@telefono.org"})
    assert r.status_code == 204 and len(outbox) == 1
    r = client.post("/api/auth/password-reset/request", json={"email": "nadie@telefono.org"})
    assert r.status_code == 204 and len(outbox) == 1
    # both answers are padded towards the same minimum duration
    assert len(slept) == 2 and all(0 < s <= auth_router.INLINE_RESET_MIN_SECONDS for s in slept)

    token = reset_token_from(outbox[0])
    r = client.post("/api/auth/password-reset/confirm", json={"token": token, "newPassword": "newpass123"})
    assert r.status_code == 204
