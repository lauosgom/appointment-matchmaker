from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.main import mount_frontend


def make_client(tmp_path):
    (tmp_path / "index.html").write_text("<html>shell</html>")
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "app.js").write_text("console.log(1)")
    (tmp_path.parent / "secret.txt").write_text("nope")
    app = FastAPI()
    mount_frontend(app, tmp_path.resolve())
    return TestClient(app)


def test_serves_index_and_assets(tmp_path):
    client = make_client(tmp_path)
    assert client.get("/").text == "<html>shell</html>"
    assert client.get("/assets/app.js").text == "console.log(1)"


def test_client_routes_fall_back_to_index(tmp_path):
    client = make_client(tmp_path)
    response = client.get("/admin/usuarios")
    assert response.status_code == 200
    assert response.text == "<html>shell</html>"


def test_unknown_api_paths_are_not_swallowed(tmp_path):
    client = make_client(tmp_path)
    assert client.get("/api/does-not-exist").status_code == 404


def test_cannot_escape_frontend_dir(tmp_path):
    client = make_client(tmp_path)
    assert client.get("/..%2Fsecret.txt").text == "<html>shell</html>"
