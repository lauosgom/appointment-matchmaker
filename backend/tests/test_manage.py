import pytest
from sqlalchemy import create_engine, text

from app import db, manage


@pytest.fixture
def database(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'prod.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    db.reset_engine()
    yield url
    db.reset_engine()


def test_create_admin_on_an_empty_database(database, monkeypatch, capsys):
    monkeypatch.setenv("ADMIN_PASSWORD", "secreto123")
    manage.main(["create-admin", "--username", "ana", "--full-name", "Ana Pérez", "--email", "ana@example.org"])
    assert "Administrator 'ana' created." in capsys.readouterr().out

    engine = create_engine(database)
    with engine.connect() as conn:
        row = conn.execute(text("SELECT role, email, password_hash FROM users WHERE username = 'ana'")).one()
    engine.dispose()
    assert row[0] == "admin" and row[1] == "ana@example.org"
    assert row[2].startswith("$2") and "secreto123" not in row[2]


def test_create_admin_refuses_duplicates_and_short_passwords(database, monkeypatch):
    monkeypatch.setenv("ADMIN_PASSWORD", "secreto123")
    args = ["create-admin", "--username", "ana", "--full-name", "Ana", "--email", "ana@example.org"]
    manage.main(args)
    with pytest.raises(SystemExit, match="Not created"):
        manage.main(args)
    monkeypatch.setenv("ADMIN_PASSWORD", "123")
    with pytest.raises(SystemExit, match="Not created"):
        manage.main(["create-admin", "--username", "bob", "--full-name", "Bob", "--email", "bob@example.org"])
