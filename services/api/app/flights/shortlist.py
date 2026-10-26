from collections.abc import Callable
from decimal import Decimal

from pydantic import BaseModel

from app.flights.options import FlightOption, SourceResult
from app.transport.options import _in_window
from app.trips.profile_store import Mode, TransportPreferences

# Fare is the main factor; time, stops and preference fit share the rest.
WEIGHTS = {"fare": Decimal("0.6"), "time": Decimal("0.2"), "stops": Decimal("0.1"), "fit": Decimal("0.1")}


class ShortlistFlight(BaseModel):
    rank: int
    flight: FlightOption
    fit: int  # 0-100, share of the saved transport preferences met
    fits_budget: bool
    over_budget_by: Decimal  # in trip currency, 0 when it fits
    reason: str


MODE_ORDER: tuple[Mode, ...] = ("flight", "train", "bus", "taxi")


def modes_without_service(sources: list[SourceResult], flights: list[FlightOption]) -> list[Mode]:
    """Modes with no entries whose sources all answered; a failed or timed-out source is not "no service"."""
    listed = {f.mode for f in flights}
    return [
        m
        for m in MODE_ORDER
        if m not in listed
        and (covering := [s for s in sources if m in s.modes])
        and all(s.status == "ok" for s in covering)
    ]


def preference_fit(f: FlightOption, prefs: TransportPreferences) -> int:
    """The share of the set preferences the flight meets; 100 when none are set."""
    met: list[bool] = []
    if prefs.modes:
        met.append(f.mode in prefs.modes)
    if prefs.max_stops is not None:
        met.append(f.stops <= prefs.max_stops)
    if prefs.departure_window is not None:
        met.append(f.departs is None or _in_window(f.departs, prefs.departure_window))
    if prefs.cabin is not None:
        met.append(f.cabin is None or f.cabin == prefs.cabin)
    if prefs.providers:
        met.append(f.provider.casefold() in {p.casefold() for p in prefs.providers})
    return round(100 * sum(met) / len(met)) if met else 100


def _lower_is_better(value: Decimal | int, low: Decimal | int, high: Decimal | int) -> Decimal:
    """Min-max scaled to 0..1 with the lowest at 1; 1 for all when they are equal."""
    return Decimal(1) if high == low else Decimal(high - value) / Decimal(high - low)


def rank_flights(
    flights: list[FlightOption], prefs: TransportPreferences, over_by: Callable[[FlightOption], Decimal]
) -> list[ShortlistFlight]:
    """Best first, budget-fitting flights before the rest. Nothing is dropped."""
    if not flights:
        return []
    fares = [f.fare for f in flights]
    times = [f.travel_minutes for f in flights]
    stops = [f.stops for f in flights]
    fits = {f.id: preference_fit(f, prefs) for f in flights}
    over = {f.id: over_by(f) for f in flights}

    def score(f: FlightOption) -> Decimal:
        return (
            WEIGHTS["fare"] * _lower_is_better(f.fare, min(fares), max(fares))
            + WEIGHTS["time"] * _lower_is_better(f.travel_minutes, min(times), max(times))
            + WEIGHTS["stops"] * _lower_is_better(f.stops, min(stops), max(stops))
            + WEIGHTS["fit"] * Decimal(fits[f.id]) / 100
        )

    ordered = sorted(
        flights,
        key=lambda f: (over[f.id] > 0, -score(f), f.fare, f.travel_minutes, f.stops, -fits[f.id], f.provider),
    )
    best_fit = max(fits.values())

    def reason(f: FlightOption) -> str:
        if f.fare == min(fares):
            return "Cheapest"
        if min(times) < max(times) and f.travel_minutes == min(times):
            return "Fastest"
        if min(stops) < max(stops) and f.stops == min(stops):
            return "Fewest stops"
        if best_fit > min(fits.values()) and fits[f.id] == best_fit:
            return "Fits your saved preferences"
        return "Balanced fare and travel time"

    return [
        ShortlistFlight(
            rank=i,
            flight=f,
            fit=fits[f.id],
            fits_budget=over[f.id] <= 0,
            over_budget_by=over[f.id],
            reason=reason(f),
        )
        for i, f in enumerate(ordered, start=1)
    ]
