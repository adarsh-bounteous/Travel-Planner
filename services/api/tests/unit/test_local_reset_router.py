from fastapi.testclient import TestClient

from app.main import app
from app.routers import auth, deps
from tests.unit.test_local_seed_startup import real_local, sign_in_demo  # noqa: F401


def test_reset_removes_previous_accounts(real_local):  # noqa: F811
    with TestClient(app) as client:
        auth._local_identity().create_confirmed_user("sam@example.com", "abcdefghij12")
        assert client.post("/local/reset").status_code == 204
        r = client.post("/auth/sign-in", json={"email": "sam@example.com", "password": "abcdefghij12"})
        assert r.status_code == 404
        assert "session" not in client.cookies


def test_reset_also_clears_trips_and_inbox(real_local):  # noqa: F811
    with TestClient(app) as client:
        deps._local_invite_sender().send("a@b.co", "Trip", "http://x")
        deps._local_trips().save_trip("user-9", deps._local_trips().list_trips("user-1")[0])
        client.post("/local/reset")
        assert deps._local_invite_sender().sent == []
        assert deps._local_trips().list_trips("user-9") == []


def test_demo_user_signs_in_after_reset(real_local):  # noqa: F811
    with TestClient(app) as client:
        client.post("/local/reset")
        assert sign_in_demo(client).status_code == 200
        names = sorted(t["name"] for t in client.get("/trips").json())
        assert names == ["Summer in Kyoto", "Weekend in Lisbon"]


def test_reset_is_404_when_local_mode_off(monkeypatch):
    monkeypatch.delenv("LOCAL_MODE", raising=False)
    assert TestClient(app).post("/local/reset").status_code == 404
