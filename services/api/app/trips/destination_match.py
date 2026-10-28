from app.trips.starter_destinations import STARTER_DESTINATIONS, fold


def best_match(typed: str | None) -> tuple[str, str] | None:
    """(country, place) the destination dropdown would pick for this text, else None.

    Mirrors apps/web/src/places/destinationMatch.ts: a stored "Place, Country" (parseDestination), then an
    exact place (evaluateDestination). A country alone, a near suggestion, empty text and no match are None,
    because the dropdown needs the traveller to confirm or pick for those.
    """
    text = fold(typed or "")
    if not text:
        return None
    choices = [(c.name, p.name) for c in STARTER_DESTINATIONS for p in c.places]
    for country, place in choices:
        if fold(f"{place}, {country}") == text:
            return country, place
    for country, place in choices:
        if fold(place) == text:
            return country, place
    return None
