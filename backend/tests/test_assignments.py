def free_slot(client, headers, specialist_id="s1"):
    slots = client.get(f"/api/specialists/{specialist_id}/slots", headers=headers).json()
    return next(s for s in slots if not s["booked"])


def test_create_assignment_requires_admin_or_orientador(client, especialista_headers):
    slot = free_slot(client, especialista_headers)
    r = client.post(
        "/api/assignments", json={"slotId": slot["id"], "personName": "Juan"}, headers=especialista_headers
    )
    assert r.status_code == 403


def test_create_assignment_requires_name_or_phone(client, orientador_headers):
    slot = free_slot(client, orientador_headers)
    r = client.post("/api/assignments", json={"slotId": slot["id"]}, headers=orientador_headers)
    assert r.status_code == 400


def test_create_assignment_rejects_invalid_phone(client, orientador_headers):
    slot = free_slot(client, orientador_headers)
    r = client.post(
        "/api/assignments",
        json={"slotId": slot["id"], "personPhone": "abc"},
        headers=orientador_headers,
    )
    assert r.status_code == 400


def test_create_assignment_rejects_unknown_slot(client, orientador_headers):
    r = client.post(
        "/api/assignments", json={"slotId": "nope", "personName": "Juan"}, headers=orientador_headers
    )
    assert r.status_code == 400


def test_create_assignment_success_sets_pending_status(client, orientador_headers):
    slot = free_slot(client, orientador_headers)
    r = client.post(
        "/api/assignments",
        json={"slotId": slot["id"], "personName": "Juan Perez", "personPhone": "3001234567"},
        headers=orientador_headers,
    )
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "pending"
    assert body["slotId"] == slot["id"]
    assert body["code"] is None


def test_create_assignment_slot_already_booked(client, orientador_headers):
    slot = free_slot(client, orientador_headers)
    r = client.post("/api/assignments", json={"slotId": slot["id"], "personName": "Primero"}, headers=orientador_headers)
    assert r.status_code == 201

    r = client.post("/api/assignments", json={"slotId": slot["id"], "personName": "Segundo"}, headers=orientador_headers)
    assert r.status_code == 400


def test_confirm_assignment_generates_code(client, orientador_headers):
    slot = free_slot(client, orientador_headers)
    created = client.post(
        "/api/assignments", json={"slotId": slot["id"], "personName": "Juan"}, headers=orientador_headers
    ).json()

    r = client.post(f"/api/assignments/{created['id']}/confirm", headers=orientador_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "confirmed"
    assert body["code"]
    assert body["confirmedBy"]


def test_confirm_assignment_only_creator_or_admin(client, orientador_headers, admin_headers, store):
    # give admin's own user a second orientador to prove ownership is actually checked,
    # not just role
    client.post(
        "/api/users",
        json={
            "username": "otro_orientador",
            "fullName": "Otro Orientador",
            "email": "otro@telefono.org",
            "role": "orientador",
            "active": True,
            "password": "secret123",
        },
        headers=admin_headers,
    )
    other_login = client.post("/api/auth/login", json={"username": "otro_orientador", "password": "secret123"})
    other_headers = {"Authorization": f"Bearer {other_login.json()['token']}"}

    slot = free_slot(client, orientador_headers)
    created = client.post(
        "/api/assignments", json={"slotId": slot["id"], "personName": "Juan"}, headers=orientador_headers
    ).json()

    r = client.post(f"/api/assignments/{created['id']}/confirm", headers=other_headers)
    assert r.status_code == 403

    r = client.post(f"/api/assignments/{created['id']}/confirm", headers=admin_headers)
    assert r.status_code == 200


def test_confirm_assignment_requires_pending_status(client, orientador_headers):
    slot = free_slot(client, orientador_headers)
    created = client.post(
        "/api/assignments", json={"slotId": slot["id"], "personName": "Juan"}, headers=orientador_headers
    ).json()
    client.post(f"/api/assignments/{created['id']}/confirm", headers=orientador_headers)

    r = client.post(f"/api/assignments/{created['id']}/confirm", headers=orientador_headers)
    assert r.status_code == 400


def test_confirm_assignment_without_year_letters_configured(client, orientador_headers, store):
    store.settings.yearLetters.clear()
    slot = free_slot(client, orientador_headers)
    created = client.post(
        "/api/assignments", json={"slotId": slot["id"], "personName": "Juan"}, headers=orientador_headers
    ).json()

    r = client.post(f"/api/assignments/{created['id']}/confirm", headers=orientador_headers)
    assert r.status_code == 400


def test_confirm_assignment_not_found(client, orientador_headers):
    r = client.post("/api/assignments/nope/confirm", headers=orientador_headers)
    assert r.status_code == 404


def test_discard_assignment(client, orientador_headers):
    slot = free_slot(client, orientador_headers)
    created = client.post(
        "/api/assignments", json={"slotId": slot["id"], "personName": "Juan"}, headers=orientador_headers
    ).json()

    r = client.post(f"/api/assignments/{created['id']}/discard", json={"reason": ""}, headers=orientador_headers)
    assert r.status_code == 400

    r = client.post(
        f"/api/assignments/{created['id']}/discard", json={"reason": "Ya no aplica"}, headers=orientador_headers
    )
    assert r.status_code == 200
    assert r.json()["status"] == "discarded"
    assert r.json()["closeReason"] == "Ya no aplica"


def test_cancel_assignment_requires_admin(client, orientador_headers):
    slot = free_slot(client, orientador_headers)
    created = client.post(
        "/api/assignments", json={"slotId": slot["id"], "personName": "Juan"}, headers=orientador_headers
    ).json()
    client.post(f"/api/assignments/{created['id']}/confirm", headers=orientador_headers)

    r = client.post(
        f"/api/assignments/{created['id']}/cancel", json={"reason": "Motivo"}, headers=orientador_headers
    )
    assert r.status_code == 403


def test_cancel_assignment_requires_confirmed_status(client, orientador_headers, admin_headers):
    slot = free_slot(client, orientador_headers)
    created = client.post(
        "/api/assignments", json={"slotId": slot["id"], "personName": "Juan"}, headers=orientador_headers
    ).json()

    r = client.post(f"/api/assignments/{created['id']}/cancel", json={"reason": "Motivo"}, headers=admin_headers)
    assert r.status_code == 400


def test_request_correction_requires_orientador(client, admin_headers, orientador_headers):
    slot = free_slot(client, orientador_headers)
    created = client.post(
        "/api/assignments", json={"slotId": slot["id"], "personName": "Juan"}, headers=orientador_headers
    ).json()
    client.post(f"/api/assignments/{created['id']}/confirm", headers=orientador_headers)

    r = client.post(
        f"/api/assignments/{created['id']}/correction-requests",
        json={"message": "Corregir nombre"},
        headers=admin_headers,
    )
    assert r.status_code == 403

    r = client.post(
        f"/api/assignments/{created['id']}/correction-requests",
        json={"message": "Corregir nombre"},
        headers=orientador_headers,
    )
    assert r.status_code == 201
    assert r.json()["message"] == "Corregir nombre"


def test_request_correction_requires_confirmed_status(client, orientador_headers):
    slot = free_slot(client, orientador_headers)
    created = client.post(
        "/api/assignments", json={"slotId": slot["id"], "personName": "Juan"}, headers=orientador_headers
    ).json()

    r = client.post(
        f"/api/assignments/{created['id']}/correction-requests",
        json={"message": "Corregir"},
        headers=orientador_headers,
    )
    assert r.status_code == 400


def test_list_assignments_scoped_by_role(client, admin_headers, orientador_headers, especialista_headers):
    slot = free_slot(client, orientador_headers)
    created = client.post(
        "/api/assignments", json={"slotId": slot["id"], "personName": "Juan"}, headers=orientador_headers
    ).json()

    # pending, created by orientador: visible to orientador filtering their own, and to admin
    r = client.get("/api/assignments", params={"createdBy": "u2"}, headers=orientador_headers)
    assert created["id"] in [a["id"] for a in r.json()]

    # but not visible to the especialista (not confirmed yet) nor to orientador without the filter
    r = client.get("/api/assignments", headers=orientador_headers)
    assert created["id"] not in [a["id"] for a in r.json()]

    r = client.get("/api/assignments", headers=especialista_headers)
    assert created["id"] not in [a["id"] for a in r.json()]

    client.post(f"/api/assignments/{created['id']}/confirm", headers=orientador_headers)

    # once confirmed, the specialist and any orientador can see it, and so can admin
    r = client.get("/api/assignments", headers=especialista_headers)
    assert created["id"] in [a["id"] for a in r.json()]

    r = client.get("/api/assignments", headers=orientador_headers)
    assert created["id"] in [a["id"] for a in r.json()]

    r = client.get("/api/assignments", headers=admin_headers)
    assert created["id"] in [a["id"] for a in r.json()]


def test_list_assignments_filter_by_status(client, orientador_headers):
    slot = free_slot(client, orientador_headers)
    created = client.post(
        "/api/assignments", json={"slotId": slot["id"], "personName": "Juan"}, headers=orientador_headers
    ).json()

    r = client.get("/api/assignments", params={"status": "pending", "createdBy": "u2"}, headers=orientador_headers)
    assert created["id"] in [a["id"] for a in r.json()]

    r = client.get("/api/assignments", params={"status": "confirmed", "createdBy": "u2"}, headers=orientador_headers)
    assert created["id"] not in [a["id"] for a in r.json()]
