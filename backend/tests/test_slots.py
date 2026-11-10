from datetime import datetime, timedelta, timezone


def iso(dt: datetime) -> str:
    return dt.isoformat().replace("+00:00", "Z")


def test_list_slots_for_specialist(client, especialista_headers):
    r = client.get("/api/specialists/s1/slots", headers=especialista_headers)
    assert r.status_code == 200
    assert len(r.json()) > 0
    assert all("booked" in s for s in r.json())


def test_add_slots_requires_admin(client, orientador_headers):
    start = iso(datetime.now(timezone.utc) + timedelta(days=30))
    r = client.post("/api/specialists/s1/slots", json={"starts": [start]}, headers=orientador_headers)
    assert r.status_code == 403


def test_add_slots_success(client, admin_headers):
    start = iso(datetime.now(timezone.utc) + timedelta(days=30))
    r = client.post("/api/specialists/s1/slots", json={"starts": [start]}, headers=admin_headers)
    assert r.status_code == 201
    created = r.json()
    assert len(created) == 1
    assert created[0]["specialistId"] == "s1"
    assert created[0]["durationMin"] == 45


def test_add_slots_rejects_past_datetime(client, admin_headers):
    start = iso(datetime.now(timezone.utc) - timedelta(days=1))
    r = client.post("/api/specialists/s1/slots", json={"starts": [start]}, headers=admin_headers)
    assert r.status_code == 400


def test_add_slots_rejects_overlap(client, admin_headers):
    start = datetime.now(timezone.utc) + timedelta(days=30)
    r = client.post("/api/specialists/s1/slots", json={"starts": [iso(start)]}, headers=admin_headers)
    assert r.status_code == 201

    overlapping = start + timedelta(minutes=10)
    r = client.post("/api/specialists/s1/slots", json={"starts": [iso(overlapping)]}, headers=admin_headers)
    assert r.status_code == 400


def test_add_slots_rejects_unknown_specialist(client, admin_headers):
    start = iso(datetime.now(timezone.utc) + timedelta(days=30))
    r = client.post("/api/specialists/nope/slots", json={"starts": [start]}, headers=admin_headers)
    assert r.status_code == 400


def test_add_slots_rejects_empty_list(client, admin_headers):
    r = client.post("/api/specialists/s1/slots", json={"starts": []}, headers=admin_headers)
    assert r.status_code == 400


def test_set_slot_active_requires_admin(client, store, orientador_headers):
    slot_id = next(s.id for s in store.slots.values() if s.specialistId == "s1")
    r = client.patch(f"/api/slots/{slot_id}", json={"active": False}, headers=orientador_headers)
    assert r.status_code == 403


def test_set_slot_active_toggle(client, store, admin_headers):
    slot_id = next(s.id for s in store.slots.values() if s.specialistId == "s1")
    r = client.patch(f"/api/slots/{slot_id}", json={"active": False}, headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["active"] is False

    r = client.patch(f"/api/slots/{slot_id}", json={"active": True}, headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["active"] is True


def test_set_slot_active_not_found(client, admin_headers):
    r = client.patch("/api/slots/nope", json={"active": False}, headers=admin_headers)
    assert r.status_code == 404


def test_set_slot_active_rejects_booked_slot(client, admin_headers):
    slots = client.get("/api/specialists/s1/slots", headers=admin_headers).json()
    free = next(s for s in slots if not s["booked"])
    client.post("/api/assignments", json={"slotId": free["id"], "personName": "Test"}, headers=admin_headers)

    r = client.patch(f"/api/slots/{free['id']}", json={"active": False}, headers=admin_headers)
    assert r.status_code == 400
