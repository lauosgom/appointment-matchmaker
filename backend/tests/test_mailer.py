import smtplib

import pytest

from app import mailer


class FakeSMTP:
    instances: list["FakeSMTP"] = []

    def __init__(self, host, port, timeout=None, context=None):
        self.host, self.port = host, port
        self.calls: list[str] = []
        self.messages = []
        FakeSMTP.instances.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def starttls(self, context=None):
        self.calls.append("starttls")

    def login(self, user, password):
        self.calls.append(f"login:{user}")

    def send_message(self, message):
        self.messages.append(message)


@pytest.fixture(autouse=True)
def fake_smtp(monkeypatch):
    FakeSMTP.instances = []
    monkeypatch.setattr(smtplib, "SMTP", FakeSMTP)
    monkeypatch.setattr(smtplib, "SMTP_SSL", FakeSMTP)


def test_sends_with_starttls_and_login(monkeypatch):
    monkeypatch.setenv("SMTP_HOST", "smtp.example.org")
    monkeypatch.setenv("SMTP_USERNAME", "citas")
    monkeypatch.setenv("SMTP_PASSWORD", "secreto")
    monkeypatch.setenv("MAIL_FROM", "Citas <citas@example.org>")
    mailer.send_password_reset("ana@example.org", "Ana", "ana", "https://x/restablecer?token=abc", 60)

    [smtp] = FakeSMTP.instances
    assert (smtp.host, smtp.port) == ("smtp.example.org", 587)
    assert smtp.calls == ["starttls", "login:citas"]
    [message] = smtp.messages
    assert message["To"] == "ana@example.org"
    assert message["From"] == "Citas <citas@example.org>"
    assert "https://x/restablecer?token=abc" in message.get_content()
    assert "60 minutos" in message.get_content()


def test_plain_smtp_without_auth(monkeypatch):
    monkeypatch.setenv("SMTP_HOST", "mailpit")
    monkeypatch.setenv("SMTP_PORT", "1025")
    monkeypatch.setenv("SMTP_SECURITY", "none")
    mailer.send_email("a@example.org", "Asunto", "Cuerpo")
    [smtp] = FakeSMTP.instances
    assert (smtp.host, smtp.port, smtp.calls) == ("mailpit", 1025, [])


def test_without_smtp_host_nothing_is_sent(monkeypatch, caplog):
    monkeypatch.delenv("SMTP_HOST", raising=False)
    mailer.send_email("a@example.org", "Asunto", "Cuerpo")
    assert FakeSMTP.instances == []
    assert "SMTP_HOST is not set" in caplog.text


def test_send_errors_are_logged_not_raised(monkeypatch, caplog):
    monkeypatch.setenv("SMTP_HOST", "smtp.example.org")

    def broken(*args, **kwargs):
        raise ConnectionRefusedError("down")

    monkeypatch.setattr(smtplib, "SMTP", broken)
    mailer.send_email("a@example.org", "Asunto", "Cuerpo")
    assert "Could not send email" in caplog.text
