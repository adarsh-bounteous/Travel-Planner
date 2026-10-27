from app.trips.medical import guidance_for
from app.trips.profile_store import Profile
from app.trips.store import Traveller

LISBON = "Lisbon, Portugal"
NOTE = "Confirm with official sources before you travel."


def _g(citizenship="Canada", residence="Canada", had=(), pregnant=None, destination=LISBON):
    return guidance_for(destination, citizenship, residence, list(had), pregnant, name="M", traveller_id="a")


def test_seeded_route_shows_tests_vaccinations_and_advisories():
    g = _g()
    assert g.result == "guidance"
    assert g.tests is not None and g.vaccinations and g.advisories


def test_citizenship_and_residence_each_change_the_output():
    ca, ind = _g(), _g("India", "India")
    assert (ca.tests, ca.vaccinations) != (ind.tests, ind.vaccinations)
    assert _g("Canada", "India").tests != ca.tests


def test_vaccination_already_had_is_not_required():
    hep = next(v for v in _g(had=["Hepatitis A"]).vaccinations if v.name == "Hepatitis A")
    assert hep.status == "already_had"


def test_no_health_details_still_shows_advisories():
    g = _g()
    assert g.advisories and g.health_details_given is False


def test_health_details_given_when_any_recorded():
    assert _g(pregnant=False).health_details_given is True
    assert _g(had=["Hepatitis A"]).health_details_given is True


def test_no_data_route_has_message_and_official_site():
    g = _g(destination="Tokyo, Japan")
    assert g.result == "no_data"
    assert g.official_site_url and g.official_site_url.startswith("https://")
    assert _g("France", "France").result == "no_data"
    assert _g("France", "France").official_site_url == "https://www.portugal.gov.pt/"


def test_no_data_for_an_unlisted_destination_still_has_an_official_site_link():
    g = _g(destination="Kyoto, Japan", citizenship="France", residence="France")
    assert g.official_site_url == "https://www.japan.travel/"
    for destination in ("Paris, France", "Atlantis", None):
        url = _g(destination=destination).official_site_url
        assert url and url.startswith("https://")
    assert "France" in _g(destination="Paris, France").official_site_url


def test_pregnant_yes_adds_advisory_and_marks_unsuitable_vaccination():
    base, preg = _g(), _g(pregnant=True)
    assert "Pregnancy advisory" in preg.advisories and "Pregnancy advisory" not in base.advisories
    mmr = next(v for v in preg.vaccinations if v.name == "MMR booster")
    assert mmr.status == "unsuitable_in_pregnancy"


def test_pregnant_no_adds_nothing_pregnancy_specific():
    for value in (False, None):
        g = _g(pregnant=value)
        assert "Pregnancy advisory" not in g.advisories
        assert all(v.status != "unsuitable_in_pregnancy" for v in g.vaccinations)


def test_already_had_beats_unsuitable_in_pregnancy():
    mmr = next(v for v in _g(had=["MMR booster"], pregnant=True).vaccinations if v.name == "MMR booster")
    assert mmr.status == "already_had"


def test_confirm_note_on_every_result():
    for g in (_g(), _g(destination="Tokyo, Japan"), _g("Ireland", "Ireland")):
        assert g.confirm_note == NOTE


def test_nothing_applies_is_none_required():
    g = _g("Ireland", "Ireland")
    assert g.result == "none_required"
    assert g.official_site_url is None


def test_pregnancy_advisory_does_not_hide_none_required_when_not_pregnant():
    assert _g("Ireland", "Ireland", pregnant=False).result == "none_required"


def test_old_stored_profile_and_traveller_still_validate():
    profile = Profile.model_validate({"display_name": "Ana"})
    traveller = Traveller.model_validate({"id": "t1", "name": "Ben"})
    for who in (profile, traveller):
        assert who.vaccinations_had == [] and who.pregnant is None
