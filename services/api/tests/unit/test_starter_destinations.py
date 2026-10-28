import pytest

from app.trips.starter_destinations import (
    STARTER_DESTINATIONS,
    content_for,
    list_countries,
    places_in,
)

ALL_PAIRS = [(c.name, p.name) for c in STARTER_DESTINATIONS for p in c.places]


def test_country_list_has_the_settled_seven():
    names = [c.name for c in STARTER_DESTINATIONS]
    assert {"Japan", "Portugal", "India"} <= set(names)
    assert len(names) == 7 and len(set(names)) == 7
    assert set(names) == {"Japan", "Portugal", "India", "Thailand", "Mexico", "Morocco", "Peru"}
    assert list_countries() == names


def test_every_country_has_exactly_three_places():
    for country in STARTER_DESTINATIONS:
        assert len(country.places) == 3, country.name
        assert len({p.name for p in country.places}) == 3
        assert places_in(country.name) == [p.name for p in country.places]


@pytest.mark.parametrize("country,place", ALL_PAIRS)
def test_every_place_has_full_content(country, place):
    c = content_for(country, place)
    assert c is not None
    assert len(c.places) >= 1 and all(i.name and i.note for i in c.places)
    assert len(c.restaurants) >= 1
    assert len(c.stays) >= 1 and all(s.price_per_night > 0 and s.currency for s in c.stays)
    assert len(c.activities) >= 1
    assert c.medical_guidance.strip() != ""


def test_lookup_ignores_case_and_accents_and_misses_return_none():
    assert content_for("japan", " TOKYO ") is not None
    assert content_for("Mexico", "oaxaca") is not None
    assert content_for("Atlantis", "Nowhere") is None
    assert content_for("Japan", "Nowhere") is None
    assert places_in("Atlantis") is None


def test_place_note_comes_before_country_guidance():
    tokyo = content_for("Japan", "Tokyo")
    kyoto = content_for("Japan", "Kyoto")
    assert tokyo.medical_guidance.startswith("Tokyo has English-speaking clinics")
    assert tokyo.medical_guidance.endswith(kyoto.medical_guidance)
