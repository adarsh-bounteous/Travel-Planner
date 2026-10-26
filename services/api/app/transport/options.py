import logging
from datetime import date, time
from decimal import Decimal
from typing import Protocol

from pydantic import BaseModel

from app.trips.profile_store import Cabin, DepartureWindow, Mode, TransportPreferences

logger = logging.getLogger(__name__)


class TransportOption(BaseModel):
    """One way of getting from origin to destination, with the price as fetched."""

    id: str
    mode: Mode
    title: str
    provider: str
    detail: str
    stops: int
    departs: time | None = None  # a taxi leaves when called, so it has no set departure
    cabin: Cabin | None = None  # None for modes with no class
    price: Decimal
    currency: str
    estimate: bool = False
    why: str
    url: str
    preferred_provider: bool = False


class TransportProvider(Protocol):
    """Where transport options come from. A real Flight and Hotel Search adapter implements this port."""

    name: str

    def fetch(self, origin: str, destination: str, on: date) -> list[TransportOption]: ...


class TransportOptions(BaseModel):
    origin: str
    destination: str
    date: date
    options: list[TransportOption]


# Clock ranges as (start hour inclusive, end hour exclusive); night wraps past midnight.
_WINDOWS: dict[DepartureWindow, tuple[int, int]] = {
    "morning": (5, 12),
    "afternoon": (12, 17),
    "evening": (17, 21),
    "night": (21, 5),
}


def _in_window(departs: time, window: DepartureWindow) -> bool:
    start, end = _WINDOWS[window]
    return start <= departs.hour < end if start < end else departs.hour >= start or departs.hour < end


def _keeps(o: TransportOption, prefs: TransportPreferences) -> bool:
    """Each unset preference keeps everything; options without a cabin or a departure time are never cut by those."""
    return (
        (not prefs.modes or o.mode in prefs.modes)
        and (prefs.max_stops is None or o.stops <= prefs.max_stops)
        and (prefs.departure_window is None or o.departs is None or _in_window(o.departs, prefs.departure_window))
        and (prefs.cabin is None or o.cabin is None or o.cabin == prefs.cabin)
    )


def apply_preferences(options: list[TransportOption], prefs: TransportPreferences) -> list[TransportOption]:
    """Narrow by the saved preferences. A preferred provider's options are never dropped; they are flagged and sorted first."""
    preferred = {p.casefold() for p in prefs.providers}
    flagged = [o.model_copy(update={"preferred_provider": o.provider.casefold() in preferred}) for o in options]
    kept = [o for o in flagged if o.preferred_provider or _keeps(o, prefs)]
    return sorted(kept, key=lambda o: not o.preferred_provider)  # stable: the rest keep provider order


def search_transport(
    providers: list[TransportProvider], origin: str, destination: str, on: date, prefs: TransportPreferences
) -> TransportOptions:
    gathered: list[TransportOption] = []
    for provider in providers:
        try:
            gathered.extend(provider.fetch(origin, destination, on))
        except Exception:
            logger.exception("transport provider %s failed", provider.name)
    return TransportOptions(
        origin=origin,
        destination=destination,
        date=on,
        options=apply_preferences(gathered, prefs),
    )
