from datetime import date

import pytest

from app.trips.starter_destinations import list_countries
from app.trips.visa import (
    OFFICIAL_SITES,
    SEED_PUBLISHED_ON,
    SEED_VISA_RULES,
    InMemoryVisaRules,
    Person,
    VisaRule,
    visa_result_for,
)


def person(name, citizenship, residence):
    return Person(traveller_id="t1", name=name, citizenship=citizenship, residence=residence)


def test_residence_override_changes_the_result_for_the_same_citizenship():
    source = InMemoryVisaRules({("Japan", "India"): VisaRule(required=True, by_residence={"Ireland": False})}, date(2026, 10, 20))
    assert visa_result_for("Tokyo, Japan", person("X", "India", "Ireland"), source, []).status == "not_needed"
    assert visa_result_for("Tokyo, Japan", person("X", "India", "Canada"), source, []).status == "required"


def test_blank_details_have_no_status():
    source = InMemoryVisaRules({}, date(2026, 10, 20))
    assert visa_result_for("Tokyo, Japan", person("X", "", "Canada"), source, []).status is None


def test_no_data_carries_the_official_link_and_no_confirm_note():
    source = InMemoryVisaRules({}, date(2026, 10, 20))
    result = visa_result_for("Lisbon, Portugal", person("X", "China", "China"), source, [])
    assert (result.status, result.confirm_note) == ("no_data", None)
    assert result.official_site_url == OFFICIAL_SITES["Portugal"]


def test_unresolved_needs_the_mark_and_no_data():
    source = InMemoryVisaRules({}, date(2026, 10, 20))
    assert visa_result_for("Lisbon, Portugal", person("X", "China", "China"), source, ["t1"]).unresolved is True
    source.publish({("Portugal", "China"): VisaRule(required=False)}, date(2026, 10, 27))
    assert visa_result_for("Lisbon, Portugal", person("X", "China", "China"), source, ["t1"]).unresolved is False


def test_no_data_for_a_destination_outside_the_table_still_links_somewhere():
    source = InMemoryVisaRules({}, date(2026, 10, 20))
    result = visa_result_for("Cusco, Peru", person("X", "India", "India"), source, [])
    assert result.status == "no_data"
    assert result.official_site_url.startswith("https://")
    assert "Peru" in result.official_site_url
    assert "advisory" not in result.official_site_url.lower()


def _seeded(country, citizenship):
    source = InMemoryVisaRules(SEED_VISA_RULES, SEED_PUBLISHED_ON)
    return visa_result_for(f"Somewhere, {country}", person("X", citizenship, citizenship), source, [])


@pytest.mark.parametrize("country", list_countries())
def test_every_offered_country_has_visa_guidance(country):
    result = _seeded(country, "Canada")
    assert result.status in ("required", "not_needed")
    assert result.guidance.country == country


@pytest.mark.parametrize("country", list_countries())
def test_unseeded_route_still_shows_no_data(country):
    for source in (InMemoryVisaRules(SEED_VISA_RULES, SEED_PUBLISHED_ON), InMemoryVisaRules({}, SEED_PUBLISHED_ON)):
        result = visa_result_for(f"Somewhere, {country}", person("X", "China", "China"), source, [])
        assert result.status == "no_data"
        assert result.guidance is None
    assert _seeded("Portugal", "China").official_site_url == OFFICIAL_SITES["Portugal"]


@pytest.mark.parametrize("citizenship", ["Canada", "India"])
@pytest.mark.parametrize("country", list_countries())
def test_guidance_has_entry_requirement_max_stay_and_documents(country, citizenship):
    guidance = _seeded(country, citizenship).guidance
    assert "visa" in guidance.entry_requirement.lower()
    assert any(ch.isdigit() for ch in guidance.max_stay)
    assert len(guidance.documents) >= 1
    assert all(d.strip() for d in guidance.documents)
