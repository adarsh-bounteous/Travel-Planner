from datetime import date

import pytest

from app.travel.local import (
    LocalFlightProvider,
    LocalStayProvider,
    LocalTransportProvider,
    generate,
    match_place,
)

KINDS = ["stay", "flight", "transport"]
START, END = date(2027, 3, 12), date(2027, 3, 15)


def ids(kind, destination="Lisbon", start=START, end=END, origin="Porto"):
    return [d.id for d in generate(kind, destination, start, end, origin)]


@pytest.mark.parametrize("kind", KINDS)
def test_each_kind_lists_several_options(kind):
    assert len(ids(kind)) >= 3


@pytest.mark.parametrize("kind", KINDS)
def test_same_search_is_stable(kind):
    assert ids(kind) == ids(kind)


@pytest.mark.parametrize("kind", KINDS)
@pytest.mark.parametrize(
    "change",
    [
        {"destination": "Paris"},
        {"start": date(2027, 3, 13)},
        {"end": date(2027, 3, 16)},
        {"origin": "Faro"},
    ],
)
def test_any_changed_input_changes_the_options(kind, change):
    if kind == "stay" and "origin" in change:
        pytest.skip("a stay has no route")
    assert ids(kind, **change) != ids(kind)


@pytest.mark.parametrize("kind", KINDS)
def test_unmatched_place_gives_nothing(kind):
    assert generate(kind, "Nowhere Land", START, END, "Porto") == []


def test_match_is_case_insensitive_and_exact():
    assert match_place("  cape TOWN ") == "Cape Town"
    assert match_place("Lisbo") is None


@pytest.mark.parametrize("kind", KINDS)
def test_urls_are_local_never_example_com(kind):
    assert all(d.url.startswith("local://booking/") and "example.com" not in d.url for d in generate(kind, "Lisbon", START, END, "Porto"))


def test_providers_implement_the_ports():
    assert len(LocalStayProvider().fetch("Lisbon", START, END)) == 3
    assert len(LocalFlightProvider().fetch("Porto", "Lisbon", START)) == 3
    assert len(LocalTransportProvider().fetch("Porto", "Lisbon", START)) == 3
    assert LocalStayProvider().fetch("Nowhere Land", START, END) == []
    assert LocalFlightProvider().modes == ("flight",)
