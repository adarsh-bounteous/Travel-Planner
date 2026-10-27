from datetime import date

from app.trips.visa import OFFICIAL_SITES, InMemoryVisaRules, Person, VisaRule, visa_result_for


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
    result = visa_result_for("Lisbon, Portugal", person("X", "India", "India"), source, [])
    assert (result.status, result.confirm_note) == ("no_data", None)
    assert result.official_site_url == OFFICIAL_SITES["Portugal"]


def test_unresolved_needs_the_mark_and_no_data():
    source = InMemoryVisaRules({}, date(2026, 10, 20))
    assert visa_result_for("Lisbon, Portugal", person("X", "India", "India"), source, ["t1"]).unresolved is True
    source.publish({("Portugal", "India"): VisaRule(required=False)}, date(2026, 10, 27))
    assert visa_result_for("Lisbon, Portugal", person("X", "India", "India"), source, ["t1"]).unresolved is False


def test_no_data_for_a_destination_outside_the_table_still_links_somewhere():
    source = InMemoryVisaRules({}, date(2026, 10, 20))
    result = visa_result_for("Cusco, Peru", person("X", "India", "India"), source, [])
    assert result.status == "no_data"
    assert result.official_site_url.startswith("https://")
    assert "Peru" in result.official_site_url
    assert "advisory" not in result.official_site_url.lower()
