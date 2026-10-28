from app.trips.destination import (
    ChosenDestination,
    chosen_destination,
    country_has_any_place,
    destination_status,
)
from app.trips.store import Trip


def _trip(**kw):
    return Trip(id="t1", name="Spring", **kw)


def test_label_is_place_comma_country():
    d = chosen_destination(_trip(country="Portugal", place="Lisbon"))
    assert (d.country, d.place, d.label) == ("Portugal", "Lisbon", "Lisbon, Portugal")


def test_label_is_the_country_when_there_is_no_place():
    d = chosen_destination(_trip(country="Portugal", place=" "))
    assert (d.place, d.label) == (None, "Portugal")


def test_blank_country_is_none():
    assert chosen_destination(_trip(country=None, place=None)) is None
    assert chosen_destination(_trip(country="  ", place="Lisbon")) is None


def test_legacy_destination_text_is_not_parsed():
    assert chosen_destination(_trip(destination="Paris, France")) is None


def test_status_rules():
    lisbon = ChosenDestination(country="Portugal", place="Lisbon", label="Lisbon, Portugal")
    no_place = lisbon.model_copy(update={"place": None})
    assert destination_status(None, needs_place=False, country_has_data=True) == "no_destination"
    assert destination_status(no_place, needs_place=True, country_has_data=True) == "no_destination"
    assert destination_status(no_place, needs_place=False, country_has_data=True) == "ready"
    assert destination_status(lisbon, needs_place=False, country_has_data=False) == "no_country_data"
    assert (
        destination_status(lisbon, needs_place=True, country_has_data=True, place_has_data=False) == "no_place_data"
    )
    assert destination_status(lisbon, needs_place=True, country_has_data=True) == "ready"


def test_country_has_any_place():
    assert country_has_any_place("Portugal", lambda p: p == "Lisbon")
    assert not country_has_any_place("Portugal", lambda p: False)
    assert not country_has_any_place("Atlantis", lambda p: True)
