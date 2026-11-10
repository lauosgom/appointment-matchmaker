def test_get_settings(client, especialista_headers):
    r = client.get("/api/settings", headers=especialista_headers)
    assert r.status_code == 200
    assert r.json()["durationMin"] == 45


def test_set_duration_requires_admin(client, orientador_headers):
    r = client.put("/api/settings/duration", json={"minutes": 30}, headers=orientador_headers)
    assert r.status_code == 403


def test_set_duration_success(client, admin_headers):
    r = client.put("/api/settings/duration", json={"minutes": 60}, headers=admin_headers)
    assert r.status_code == 200
    assert "needsReview" in r.json()

    r = client.get("/api/settings", headers=admin_headers)
    assert r.json()["durationMin"] == 60


def test_set_duration_out_of_range(client, admin_headers):
    r = client.put("/api/settings/duration", json={"minutes": 3}, headers=admin_headers)
    assert r.status_code == 422  # pydantic ge/le rejects it before the store

    r = client.put("/api/settings/duration", json={"minutes": 1000}, headers=admin_headers)
    assert r.status_code == 422


def test_set_year_letters_requires_admin(client, orientador_headers):
    r = client.put("/api/settings/year-letters/2026", json={"letters": "ZZ"}, headers=orientador_headers)
    assert r.status_code == 403


def test_set_year_letters_success(client, admin_headers):
    r = client.put("/api/settings/year-letters/2030", json={"letters": "zz"}, headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["yearLetters"]["2030"] == "ZZ"


def test_set_year_letters_invalid_year(client, admin_headers):
    r = client.put("/api/settings/year-letters/26", json={"letters": "ZZ"}, headers=admin_headers)
    assert r.status_code == 400


def test_set_year_letters_invalid_letters(client, admin_headers):
    r = client.put("/api/settings/year-letters/2030", json={"letters": "Z1"}, headers=admin_headers)
    assert r.status_code == 422  # pydantic pattern rejects it before the store
