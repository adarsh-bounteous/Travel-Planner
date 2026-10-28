import pytest

from app.trips.destination_match import best_match

# Shared with apps/web/src/places/destinationMatch.test.ts so the two matchers cannot drift.
CASES = [
    ("Lisbon", ("Portugal", "Lisbon")),
    ("  lisbon ", ("Portugal", "Lisbon")),
    ("Lisbon, Portugal", ("Portugal", "Lisbon")),
    ("Lisbn", None),
    ("Portugal", None),
    ("", None),
    (None, None),
    ("Atlantis", None),
]


@pytest.mark.parametrize(("typed", "expected"), CASES)
def test_best_match_follows_the_dropdown(typed, expected):
    assert best_match(typed) == expected
