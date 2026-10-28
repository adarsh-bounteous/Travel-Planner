from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import deps
from app.routers.deps import get_recommendations
from app.trips.recommendations import InMemoryRecommendations, Recommendation
from app.trips.destination_match import best_match
from tests.trip_body import choose_destination
from tests.unit.test_local_trips_invites_share import BODY, demo, local  # noqa: F401


@pytest.fixture
def client(local):  # noqa: F811
    return demo(local)


def get_for(client, destination, interests=None):
    body = {**BODY, "destination": destination, "interests": interests or []}
    tid = client.post("/trips", json=body).json()["id"]
    choose_destination(tid, *(best_match(destination) or (None, None)))
    r = client.get(f"/trips/{tid}/recommendations")
    assert r.status_code == 200
    return r.json()["items"]


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
    fake = InMemoryRecommendations({"lisbon": [Recommendation(id="fake", name="Fake", detail="d")]})
    app.dependency_overrides[get_recommendations] = lambda: fake
    tid = client.post("/trips", json=BODY).json()["id"]
    choose_destination(tid, "Portugal", "Lisbon")
    assert [r["id"] for r in client.get(f"/trips/{tid}/recommendations").json()["items"]] == ["fake"]


@pytest.mark.parametrize("mode,has_kyoto", [("on", True), ("off", False)])
def test_switch_picks_the_source(monkeypatch, mode, has_kyoto):
    monkeypatch.setenv("LOCAL_MODE", mode)
    monkeypatch.setenv("APP_ENV", "local")
    source = get_recommendations()
    assert isinstance(source, InMemoryRecommendations)
    assert ("kyoto" in source._catalogue) is has_kyoto


def test_editing_a_trip_keeps_its_interests(client):
    tid = client.post("/trips", json={**BODY, "destination": "Lisbon", "interests": ["Culture"]}).json()["id"]
    choose_destination(tid, "Portugal", "Lisbon")
    edit = {k: BODY[k] for k in ("name", "destination", "start_date", "end_date", "budget")}
    assert client.put(f"/trips/{tid}", json={**edit, "destination": "Lisbon", "name": "Renamed"}).status_code == 200
    recs = client.get(f"/trips/{tid}/recommendations").json()["items"]
    assert recs and {r["interest"] for r in recs} == {"Culture"}


def test_service_source_recommendations_match_interests_and_can_be_saved(client):
    app.dependency_overrides[get_recommendations] = deps._recommendations
    tid = client.post("/trips", json={**BODY, "destination": "Lisbon", "interests": ["Culture"]}).json()["id"]
    choose_destination(tid, "Portugal", "Lisbon")
    recs = client.get(f"/trips/{tid}/recommendations").json()["items"]
    assert recs and all(r["interest"] == "Culture" and r["place"]["id"] for r in recs)


PUBLIC = Path(__file__).resolve().parents[4] / "apps" / "web" / "public"


@pytest.mark.parametrize("dest", ["Lisbon", "Kyoto"])
def test_local_recommendation_images_are_app_paths(client, dest):
    recs = get_for(client, dest)
    assert recs
    for r in recs:
        url = r["place"]["image_url"]
        assert url.startswith("/rec/") and not url.startswith("//")
        assert "picsum" not in url and not url.startswith("http")


def test_every_local_image_file_exists():
    from app.trips.recommendations import SEED_LOCAL_RECOMMENDATIONS

    urls = {r.place.image_url for recs in SEED_LOCAL_RECOMMENDATIONS.values() for r in recs}
    assert urls and all((PUBLIC / u.lstrip("/")).is_file() for u in urls)


def test_places_catalogue_image_is_unchanged():
    from app.places.search import _place

    assert _place("x", "X", "park", "free", 1, 2).image_url == "https://picsum.photos/seed/x/400/300"


def test_non_local_recommendations_keep_their_image():
    from app.trips.recommendations import SEED_RECOMMENDATIONS

    assert all(r.place.image_url.startswith("https://") for r in SEED_RECOMMENDATIONS["lisbon"])


def test_image_is_stable_across_visits(client):
    first = {r["id"]: r["place"]["image_url"] for r in get_for(client, "Lisbon")}
    second = {r["id"]: r["place"]["image_url"] for r in get_for(client, "Lisbon")}
    assert first == second


def test_unknown_slug_gets_placeholder():
    from app.trips.recommendations import local_image_url

    assert local_image_url("no-such-recommendation") == "/rec/placeholder.svg"
