import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import deps
from app.routers.deps import get_recommendations
from app.trips.recommendations import InMemoryRecommendations, Recommendation
from tests.unit.test_local_trips_invites_share import BODY, demo, local  # noqa: F401


@pytest.fixture
def client(local):  # noqa: F811
    return demo(local)


def get_for(client, destination, interests=None):
    body = {**BODY, "destination": destination, "interests": interests or []}
    tid = client.post("/trips", json=body).json()["id"]
    r = client.get(f"/trips/{tid}/recommendations")
    assert r.status_code == 200
    return r.json()


def test_trip_with_destination_gets_recommendations(client):
    assert 1 <= len(get_for(client, "Lisbon", ["Food"])) <= 5


def test_unknown_destination_has_none(client):
    assert get_for(client, "Nowhere Bay", ["Food"]) == []


def test_destinations_differ(client):
    lisbon = {r["id"] for r in get_for(client, "Lisbon")}
    kyoto = {r["id"] for r in get_for(client, "Kyoto")}
    assert lisbon and kyoto and lisbon.isdisjoint(kyoto)


def test_only_matching_interests_listed(client):
    recs = get_for(client, "Lisbon", ["Culture"])
    assert recs and {r["interest"] for r in recs} == {"Culture"}


def test_recommendations_carry_a_place_to_save(client):
    assert all(r["place"]["id"] for r in get_for(client, "Kyoto"))


def test_trip_without_interests_key_still_loads(client):
    tid = client.post("/trips", json=BODY).json()["id"]
    assert client.get(f"/trips/{tid}/recommendations").status_code == 200


def test_route_uses_the_injected_source(client):
    fake = InMemoryRecommendations({"rome": [Recommendation(id="fake", name="Fake", detail="d")]})
    app.dependency_overrides[get_recommendations] = lambda: fake
    tid = client.post("/trips", json=BODY).json()["id"]
    assert [r["id"] for r in client.get(f"/trips/{tid}/recommendations").json()] == ["fake"]


@pytest.mark.parametrize("mode,has_kyoto", [("on", True), ("off", False)])
def test_switch_picks_the_source(monkeypatch, mode, has_kyoto):
    monkeypatch.setenv("LOCAL_MODE", mode)
    monkeypatch.setenv("APP_ENV", "local")
    source = get_recommendations()
    assert isinstance(source, InMemoryRecommendations)
    assert ("kyoto" in source._catalogue) is has_kyoto
