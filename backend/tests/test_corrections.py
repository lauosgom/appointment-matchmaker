def test_list_corrections_requires_admin(client, orientador_headers):
    r = client.get("/api/correction-requests", headers=orientador_headers)
    assert r.status_code == 403


def test_list_corrections_newest_first(client, admin_headers, orientador_headers):
    slots = client.get("/api/specialists/s1/slots", headers=admin_headers).json()
    free = [s for s in slots if not s["booked"]]

    created_ids = []
    for slot in free[:2]:
        a = client.post(
            "/api/assignments", json={"slotId": slot["id"], "personName": "Juan"}, headers=orientador_headers
        ).json()
        client.post(f"/api/assignments/{a['id']}/confirm", headers=orientador_headers)
        c = client.post(
            f"/api/assignments/{a['id']}/correction-requests",
            json={"message": f"Corregir {a['id']}"},
            headers=orientador_headers,
        ).json()
        created_ids.append(c["id"])

    r = client.get("/api/correction-requests", headers=admin_headers)
    assert r.status_code == 200
    ids = [c["id"] for c in r.json()]
    # newest first: the second correction created should come before the first
    assert ids.index(created_ids[1]) < ids.index(created_ids[0])
