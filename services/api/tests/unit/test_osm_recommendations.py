from datetime import date

from app.places.search import Place
from app.trips.osm_recommendations import FallbackRecommendations, OsmRecommendations
from app.trips.recommendations import SEED_RECOMMENDATIONS, InMemoryRecommendations

TODAY = date(2026, 10, 31)


def osm_place(category):
    return Place(
        id="osm-node-1", name="N", image_url="x", place_type="food", lat=1, lng=2,
        source="osm", category=category, address="1 Rua X",
    )


class Places:
    def __init__(self, places):
        self.places = places

    def search(self, destination):
        return self.places


def test_osm_places_become_recommendations_with_interest():
    recs = OsmRecommendations(Places([osm_place("viewpoints"), osm_place("nightlife")])).for_destination("Lisbon")
    assert [r.interest for r in recs] == ["Outdoors", "Nightlife"]
    assert recs[0].place.source == "osm" and "1 Rua X" in recs[0].detail


def test_fallback_stamps_seed():
    seed = InMemoryRecommendations(SEED_RECOMMENDATIONS)
    recs = FallbackRecommendations(OsmRecommendations(Places([])), seed, lambda: TODAY).for_destination("Lisbon")
    assert recs and all(r.place.source == "seed" and r.place.as_of == TODAY for r in recs)


def test_fallback_uses_osm_when_present():
    seed = InMemoryRecommendations(SEED_RECOMMENDATIONS)
    recs = FallbackRecommendations(OsmRecommendations(Places([osm_place("food")])), seed, lambda: TODAY).for_destination("X")
    assert {r.place.source for r in recs} == {"osm"}


def test_off_uses_seed():
    seed = InMemoryRecommendations(SEED_RECOMMENDATIONS)
    recs = FallbackRecommendations(None, seed, lambda: TODAY).for_destination("Lisbon")
    assert recs and recs[0].place.source == "seed"
