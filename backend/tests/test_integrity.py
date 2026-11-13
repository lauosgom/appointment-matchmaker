"""Database-level guarantees that hold even when requests race each other."""

from datetime import datetime, timezone

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError

from app.db import create_schema
from app.store import Store
from app.tables import AssignmentRow
from tests.conftest import auth_headers


def _assignment(id: str, slot_id: str, status: str) -> AssignmentRow:
    now = datetime.now(timezone.utc)
    return AssignmentRow(
        id=id, slot_id=slot_id, specialist_id="s1", start=now, duration_min=45,
        person_name="X", status=status, created_at=now, created_by="u2",
    )


def test_database_refuses_two_open_assignments_for_one_slot(db):
    slot = db.execute(text("SELECT id FROM slots LIMIT 1")).scalar_one()
    db.add(_assignment("a1", slot, "pending"))
    db.commit()
    db.add(_assignment("a2", slot, "confirmed"))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
    # Closed assignments don't hold the slot.
    db.add_all([_assignment("a3", slot, "discarded"), _assignment("a4", slot, "cancelled")])
    db.commit()


def test_booking_that_loses_the_race_gets_a_clear_message(client, monkeypatch):
    """If the 'is it booked?' check passes in two requests at once, the index stops the second."""
    headers = auth_headers(client, "orientador", "orientador123")
    slot = next(s for s in client.get("/api/specialists/s1/slots", headers=headers).json() if not s["booked"])
    assert client.post("/api/assignments", json={"slotId": slot["id"], "personName": "A"}, headers=headers).status_code == 201

    monkeypatch.setattr(Store, "is_booked", lambda self, slot_id: False)  # simulate the stale check
    r = client.post("/api/assignments", json={"slotId": slot["id"], "personName": "B"}, headers=headers)
    assert r.status_code == 400
    assert r.json()["message"] == "Este horario ya no está disponible. Busca y selecciona otro espacio."


def test_confirm_after_discard_is_refused(client):
    headers = auth_headers(client, "orientador", "orientador123")
    slot = next(s for s in client.get("/api/specialists/s1/slots", headers=headers).json() if not s["booked"])
    a = client.post("/api/assignments", json={"slotId": slot["id"], "personName": "A"}, headers=headers).json()
    assert client.post(f"/api/assignments/{a['id']}/discard", json={"reason": "x"}, headers=headers).status_code == 200
    r = client.post(f"/api/assignments/{a['id']}/confirm", headers=headers)
    assert r.status_code == 400
    assert client.get("/api/assignments", params={"createdBy": "u2"}, headers=headers).json()[0]["code"] is None


def test_schema_upgrade_of_an_older_database(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE users (id VARCHAR(40) PRIMARY KEY)"))
        conn.execute(text("CREATE TABLE password_reset_tokens (token VARCHAR(100) PRIMARY KEY, user_id VARCHAR(40))"))
        conn.execute(text("INSERT INTO password_reset_tokens VALUES ('plain-old-token', 'u1')"))

    create_schema(engine)
    create_schema(engine)  # idempotent

    insp = inspect(engine)
    assert "expires_at" in {c["name"] for c in insp.get_columns("password_reset_tokens")}
    assert "uq_assignments_open_slot" in {i["name"] for i in insp.get_indexes("assignments")}
    with engine.connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM password_reset_tokens")).scalar_one() == 0
    engine.dispose()


def test_schema_upgrade_with_existing_duplicates_still_starts(tmp_path, caplog):
    engine = create_engine(f"sqlite:///{tmp_path / 'dup.db'}")
    create_schema(engine)
    with engine.begin() as conn:
        conn.execute(text("DROP INDEX uq_assignments_open_slot"))
        conn.execute(text("PRAGMA foreign_keys=OFF"))
        for i in (1, 2):
            conn.execute(text(
                "INSERT INTO assignments (id, slot_id, specialist_id, start, duration_min, status, created_at, created_by) "
                f"VALUES ('a{i}', 'sl1', 's1', '2030-01-01', 45, 'pending', '2030-01-01', 'u1')"
            ))
    create_schema(engine)
    assert "Could not create index uq_assignments_open_slot" in caplog.text
    engine.dispose()
