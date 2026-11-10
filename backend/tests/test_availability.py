from app.colombia_time import colombia_day_key


def test_search_by_specialist(client, especialista_headers):
    r = client.get("/api/availability/search", params={"by": "specialist", "id": "s1"}, headers=especialista_headers)
    assert r.status_code == 200
    results = r.json()
    assert len(results) > 0
    assert all(res["specialist"]["id"] == "s1" for res in results)


def test_search_by_department(client, especialista_headers):
    r = client.get(
        "/api/availability/search", params={"by": "department", "id": "d1"}, headers=especialista_headers
    )
    assert r.status_code == 200
    results = r.json()
    assert len(results) > 0
    # d1 (Psicología) is covered by specialists s1 and s2 only
    assert all(res["specialist"]["id"] in {"s1", "s2"} for res in results)


def test_search_requires_auth(client):
    r = client.get("/api/availability/search", params={"by": "specialist", "id": "s1"})
    assert r.status_code == 401


def test_search_with_date_filter(client, especialista_headers):
    all_results = client.get(
        "/api/availability/search", params={"by": "specialist", "id": "s1"}, headers=especialista_headers
    ).json()
    assert all_results

    from datetime import datetime

    first_day = colombia_day_key(datetime.fromisoformat(all_results[0]["slot"]["start"].replace("Z", "+00:00")))

    r = client.get(
        "/api/availability/search",
        params={"by": "specialist", "id": "s1", "date": first_day},
        headers=especialista_headers,
    )
    assert r.status_code == 200
    for res in r.json():
        start = datetime.fromisoformat(res["slot"]["start"].replace("Z", "+00:00"))
        assert colombia_day_key(start) == first_day


def test_search_excludes_booked_slots(client, especialista_headers, admin_headers):
    before = client.get(
        "/api/availability/search", params={"by": "specialist", "id": "s1"}, headers=especialista_headers
    ).json()
    target = before[0]["slot"]["id"]

    client.post("/api/assignments", json={"slotId": target, "personName": "Alguien"}, headers=admin_headers)

    after = client.get(
        "/api/availability/search", params={"by": "specialist", "id": "s1"}, headers=especialista_headers
    ).json()
    assert target not in [res["slot"]["id"] for res in after]
    assert len(after) == len(before) - 1
