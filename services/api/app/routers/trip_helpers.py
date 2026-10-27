from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.auth.identity import IdentityProvider
from app.routers.auth import get_identity
from app.routers.deps import (
    get_current_user,
    get_forecast,
    get_last_known_rates,
    get_rates,
    get_today,
    get_trips,
)
from app.routers.trips import _owned_trip
from app.trips.destination_info import TypicalWeather, currency_for, typical_weather_for
from app.trips.forecast import DayForecast, ForecastSource, ForecastUnavailable, forecast_dates
from app.trips.rates import LastKnownRates, RateSource, RateUnavailable
from app.trips.store import TripStore

router = APIRouter(prefix="/trips/{trip_id}")


class LiveRate(BaseModel):
    rate: str  # how many home currency one destination currency buys
    inverse: str
    as_of: date


class LastKnownRate(BaseModel):
    rate: str
    as_of: date


class CurrencyHelper(BaseModel):
    destination_currency: str | None
    home_currency: str
    live: LiveRate | None
    last_known: LastKnownRate | None  # only set when live is null
    start_date: date | None
    end_date: date | None


class ForecastResult(BaseModel):
    status: Literal["available", "unavailable"]
    days: list[DayForecast]


class WeatherHelper(BaseModel):
    typical: TypicalWeather | None
    forecast: ForecastResult | None  # null = out of range
    start_date: date | None
    end_date: date | None


def _plain(value: Decimal, places: str) -> str:
    return format(value.quantize(Decimal(places), rounding=ROUND_HALF_UP).normalize(), "f")


@router.get("/currency-helper")
def currency_helper(
    trip_id: str,
    owner: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    identity: IdentityProvider = Depends(get_identity),
    rates: RateSource = Depends(get_rates),
    last_known: LastKnownRates = Depends(get_last_known_rates),
    today: date = Depends(get_today),
) -> CurrencyHelper:
    trip = _owned_trip(trips, identity, owner, trip_id)
    destination = currency_for(trip.destination)
    home = trip.currency
    live: LiveRate | None = None
    remembered: LastKnownRate | None = None
    if destination:
        try:
            rate = rates.rate(destination, home)
        except RateUnavailable:
            rate = None
            seen = last_known.get(destination, home)
            if seen:
                remembered = LastKnownRate(rate=_plain(seen[0], "0.000001"), as_of=seen[1])
        if rate:
            last_known.remember(destination, home, rate, today)
            live = LiveRate(
                rate=_plain(rate, "0.000001"), inverse=_plain(1 / rate, "0.01"), as_of=today
            )
    return CurrencyHelper(
        destination_currency=destination,
        home_currency=home,
        live=live,
        last_known=remembered,
        start_date=trip.start_date,
        end_date=trip.end_date,
    )


@router.get("/weather-helper")
def weather_helper(
    trip_id: str,
    owner: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    identity: IdentityProvider = Depends(get_identity),
    forecasts: ForecastSource = Depends(get_forecast),
    today: date = Depends(get_today),
) -> WeatherHelper:
    trip = _owned_trip(trips, identity, owner, trip_id)
    typical = typical_weather_for(trip.destination, trip.start_date.month) if trip.start_date else None
    window = forecast_dates(trip.start_date, trip.end_date, today)
    forecast: ForecastResult | None = None
    if window and trip.destination:
        try:
            days = forecasts.for_dates(trip.destination, *window)
            forecast = ForecastResult(status="available", days=days)
        except ForecastUnavailable:
            forecast = ForecastResult(status="unavailable", days=[])
    return WeatherHelper(
        typical=typical, forecast=forecast, start_date=trip.start_date, end_date=trip.end_date
    )
