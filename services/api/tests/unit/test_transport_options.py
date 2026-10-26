from app.transport.options import apply_preferences
from app.transport.providers import SEED_OPTIONS
from app.trips.profile_store import TransportPreferences


def test_no_preferences_excludes_nothing():
    assert len(apply_preferences(SEED_OPTIONS, TransportPreferences())) == len(SEED_OPTIONS)


def test_no_preferred_mode_keeps_every_mode():
    result = apply_preferences(SEED_OPTIONS, TransportPreferences(max_stops=2))
    assert {o.mode for o in result} == {"flight", "train", "bus", "taxi"}


def test_preferred_modes_keep_only_those_modes():
    result = apply_preferences(SEED_OPTIONS, TransportPreferences(modes=["train"]))
    assert {o.mode for o in result} == {"train"}


def test_any_max_stops_is_applied():
    assert all(o.stops <= 3 for o in apply_preferences(SEED_OPTIONS, TransportPreferences(max_stops=3)))
    assert all(o.stops <= 1 for o in apply_preferences(SEED_OPTIONS, TransportPreferences(max_stops=1)))
    assert any(o.stops == 2 for o in apply_preferences(SEED_OPTIONS, TransportPreferences(max_stops=3)))


def test_departure_window_keeps_options_leaving_then():
    result = apply_preferences(SEED_OPTIONS, TransportPreferences(departure_window="evening"))
    assert {o.title for o in result if o.departs} == {"Flight - Other Air"}


def test_cabin_does_not_exclude_modes_without_one():
    result = apply_preferences(SEED_OPTIONS, TransportPreferences(cabin="business"))
    assert {o.mode for o in result} == {"bus", "taxi"}


def test_preferred_provider_is_flagged_kept_and_first():
    prefs = TransportPreferences(providers=["example air"], max_stops=0, modes=["bus"])
    result = apply_preferences(SEED_OPTIONS, prefs)
    flagged = [o for o in result if o.provider == "Example Air" and o.mode == "flight"]
    assert flagged and all(o.preferred_provider for o in flagged)
    assert result[0].provider == "Example Air"
    assert not any(o.preferred_provider for o in result if o.provider != "Example Air")
