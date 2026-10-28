from collections.abc import Callable
from typing import Literal

from pydantic import BaseModel

from app.trips.starter_destinations import places_in
from app.trips.store import Trip

DestinationStatus = Literal["ready", "no_destination", "no_country_data", "no_place_data"]


class ChosenDestination(BaseModel):
    country: str
    place: str | None
    label: str  # "Lisbon, Portugal" (same text as the web destinationLabel); just the country with no place


def chosen_destination(trip: Trip) -> ChosenDestination | None:
    """The trip's chosen country and place (blank counts as unset); None when no country is chosen."""
    country = (trip.country or "").strip()
    if not country:
        return None
    place = (trip.place or "").strip() or None
    return ChosenDestination(country=country, place=place, label=f"{place}, {country}" if place else country)


def destination_status(
    chosen: ChosenDestination | None,
    *,
    needs_place: bool,
    country_has_data: bool,
    place_has_data: bool = True,
) -> DestinationStatus:
    if chosen is None or (needs_place and not chosen.place):
        return "no_destination"
    if not country_has_data:
        return "no_country_data"
    if needs_place and not place_has_data:
        return "no_place_data"
    return "ready"


def country_has_any_place(country: str, place_has_data: Callable[[str], bool]) -> bool:
    """True when any starter place of this country has data; False for an unknown country."""
    return any(place_has_data(p) for p in places_in(country) or [])
