from datetime import date, datetime
from decimal import Decimal

from app.trips.essentials import build_essentials
from app.trips.itinerary import build_itinerary
from app.trips.profile_store import Profile
from app.trips.store import ChosenSim, InsurancePick, Reminder, Trip
from app.trips.visa import SEED_VISA_RULES, InMemoryVisaRules

TODAY = date(2026, 10, 31)
PICKED = datetime(2026, 10, 9, 12, 0)


def _rules() -> InMemoryVisaRules:
    return InMemoryVisaRules(SEED_VISA_RULES, date(2026, 10, 20))


def _profile(citizenship="Canada") -> Profile:
    return Profile(citizenship=citizenship, residence=citizenship)


def _trip(**changes) -> Trip:
    fields = {
        "id": "t1",
        "name": "Lisbon",
        "destination": "Lisbon, Portugal",
        "start_date": date(2026, 11, 14),
        "end_date": date(2026, 11, 16),
    }
    return Trip(**{**fields, **changes})


def _trip_full(**changes) -> Trip:
    return _trip(
        updated_at=PICKED,
        insurance=InsurancePick(
            plan_id="p1", name="Gold Cover", provider="SafeTrip", url="https://safetrip.example.com/p1",
            total=Decimal("40"), currency="EUR",
        ),
        sim=ChosenSim(
            option_id="s1", name="Lisbon eSIM", provider="Vodafone Portugal", sim_type="esim",
            valid_from=date(2026, 11, 14), valid_to=date(2026, 11, 28), data_gb=Decimal("10"),
            price=Decimal("12"), currency="EUR", url="https://vodafone.example.com/s1",
        ),
        **changes,
    )


def _facts(trip, citizenship="Canada"):
    return {f.key: f for f in build_essentials(trip, _profile(citizenship), _rules(), TODAY)[0]}


def test_every_fact_has_value_source_and_date():
    facts = _facts(_trip_full())
    for key in ("visa", "insurance", "sim", "currency", "weather"):
        assert facts[key].value and facts[key].source and facts[key].as_of is not None
    assert facts["sim"].as_of == date(2026, 10, 9)
    assert facts["sim"].source == "Vodafone Portugal"


def test_visa_links_to_the_official_site():
    visa = _facts(_trip_full())["visa"]
    assert visa.link_url == "https://vistos.mne.gov.pt/en"
    assert visa.as_of == date(2026, 10, 20)


def test_visa_without_data_has_no_status_and_only_the_seeded_link():
    visa = _facts(_trip_full(), citizenship="Brazil")["visa"]
    assert visa.value is None and visa.source is None and visa.as_of is None
    assert _facts(_trip(destination="Thailand"), citizenship="Brazil")["visa"].link_url is None


def test_medical_only_when_the_destination_has_guidance():
    assert "medical" in _facts(_trip(destination="Portugal"))
    medical = _facts(_trip(destination="Portugal"))["medical"]
    assert medical.source and medical.as_of is not None
    assert "medical" not in _facts(_trip(destination="Peru"))


def test_medical_is_omitted_without_a_profile_or_without_guidance_for_it():
    no_profile = build_essentials(_trip(destination="Portugal"), None, _rules(), TODAY)[0]
    assert "medical" not in {f.key for f in no_profile}
    assert "medical" not in _facts(_trip(destination="Portugal"), citizenship="Brazil")


def test_medical_summary_keeps_vaccinations_and_tests():
    profile = Profile(citizenship="India", residence="India")
    medical = next(f for f in build_essentials(_trip(destination="Portugal"), profile, _rules(), TODAY)[0] if f.key == "medical")
    assert "Typhoid" in medical.value and "TB screening" in medical.value


def test_checklist_is_six_items_in_order():
    _, checklist, _ = build_essentials(_trip(), None, _rules(), TODAY)
    assert [c.key for c in checklist] == ["passport", "visa", "insurance", "sim", "reminders", "bookings"]
    assert not any(c.done for c in checklist)


def test_checklist_done_state():
    trip = _trip_full(checklist_done=["visa"])
    by_key = {c.key: c for c in build_essentials(trip, _profile(), _rules(), TODAY)[1]}
    assert by_key["visa"].done is True
    assert by_key["passport"].done is False
    assert by_key["insurance"].done is True and by_key["sim"].done is True
    assert by_key["reminders"].done is False
    reminded = _trip(reminders=[Reminder(id="r1", text="Pack", date=date(2026, 11, 1))])
    assert {c.key: c for c in build_essentials(reminded, None, _rules(), TODAY)[1]}["reminders"].done is True


def test_empty_trip_shows_no_value_for_the_planned_facts():
    facts = _facts(Trip(id="t", name="Empty"))
    for key in ("visa", "insurance", "sim", "weather"):
        assert facts[key].value is None
    assert "medical" not in facts


def test_notes_list_only_facts_that_have_a_value():
    notes = build_essentials(_trip(), _profile(), _rules(), TODAY)[2]
    assert notes.price_notice and notes.confirm_notice
    assert [s.label for s in notes.sources] == ["Visa status", "Currency", "Typical weather for your dates", "Medical guidance"]


def test_old_trip_still_loads():
    trip = Trip.model_validate({"id": "t", "name": "Old"})
    assert trip.checklist_done == []
    itinerary = build_itinerary(trip, None, _rules(), TODAY)
    assert len(itinerary.checklist) == 6 and not any(c.done for c in itinerary.checklist)
