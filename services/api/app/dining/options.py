import logging
from decimal import Decimal
from typing import Protocol

from pydantic import BaseModel

from app.trips.store import Trip

logger = logging.getLogger(__name__)

# Profile answers (apps/web/src/trips/profileQuestions.ts) that carry a food rule. Anything else adds no requirement.
DIET_TAGS = {
    "vegetarian": "vegetarian",
    "vegan": "vegan",
    "halal": "halal",
    "kosher": "kosher",
    "gluten-free": "gluten-free",
}
RELIGION_TAGS = {"muslim": "halal", "jewish": "kosher"}

# Home-country cuisine, derived from the profile's residence.
COUNTRY_CUISINE = {
    "Portugal": "Portuguese",
    "France": "French",
    "India": "Indian",
    "Japan": "Japanese",
}


class ProviderRestaurant(BaseModel):
    """One restaurant as a provider lists it. `suits` holds VERIFIED suitability tags only."""

    name: str
    city: str
    cuisine: str
    dining_style: str
    price_level: int  # 1 (cheapest) to 4
    typical_price: Decimal | None  # per person, whole currency units; None = no known price
    currency: str
    suits: list[str]
    url: str | None = None


class RestaurantProvider(Protocol):
    """Where restaurants come from. A real maps and places adapter implements this port."""

    name: str

    def fetch(self, place: str) -> list[ProviderRestaurant]: ...


class DiningFilters(BaseModel):
    diet: str = ""
    religion: str = ""
    dining_style: str = ""
    price_level: int | None = None
    home_cuisine: str = ""
    extra_needs: list[str] = []


class RestaurantOption(ProviderRestaurant):
    pass


class RestaurantOptions(BaseModel):
    place: str
    options: list[RestaurantOption]


def _fold(text: str) -> str:
    return " ".join(text.casefold().split())


def required_tags(filters: DiningFilters) -> list[str]:
    """Diet tag, religion tag and the trip's extra needs, without repeats."""
    tags = [DIET_TAGS.get(_fold(filters.diet)), RELIGION_TAGS.get(_fold(filters.religion)), *filters.extra_needs]
    return list(dict.fromkeys(t for t in tags if t))


def gather_restaurants(providers: list[RestaurantProvider], trip: Trip, filters: DiningFilters) -> RestaurantOptions:
    """Restaurants at the trip destination that meet every filter; home-country cuisine is listed first.

    A required tag missing from `suits` means unknown or unverified, so the restaurant is hidden.
    """
    place = trip.destination or ""
    found: list[ProviderRestaurant] = []
    for provider in providers if place else []:
        try:
            found.extend(provider.fetch(place))
        except Exception:
            logger.exception("restaurant provider %s failed", provider.name)

    needed = required_tags(filters)
    kept = [
        r
        for r in found
        if _fold(r.city) == _fold(place)
        and (not filters.dining_style or _fold(r.dining_style) == _fold(filters.dining_style))
        and (filters.price_level is None or r.price_level <= filters.price_level)
        and all(tag in r.suits for tag in needed)
    ]
    home = _fold(filters.home_cuisine)
    kept.sort(key=lambda r: not (home and _fold(r.cuisine) == home))  # stable: others keep their order
    return RestaurantOptions(place=place, options=[RestaurantOption(**r.model_dump()) for r in kept])
