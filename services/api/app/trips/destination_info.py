from datetime import date

from pydantic import BaseModel

from app.trips.visa import destination_country as _country


class TypicalWeather(BaseModel):
    month: int  # 1-12
    summary: str
    high_c: int
    low_c: int
    rain_mm: int
    rain_days: int
    as_of: date  # date of the climate data, shown as "dated ..."


# Seeded until a destination data source is chosen. Keyed by country, or by a known city.
_CURRENCY = {
    "Japan": "JPY", "Tokyo": "JPY",
    "Portugal": "EUR", "Lisbon": "EUR",
    "France": "EUR", "Paris": "EUR",
    "Italy": "EUR", "Rome": "EUR",
    "Spain": "EUR", "Barcelona": "EUR",
    "Germany": "EUR", "Berlin": "EUR",
    "Peru": "PEN", "Lima": "PEN",
    "South Africa": "ZAR", "Cape Town": "ZAR",
    "Morocco": "MAD", "Marrakech": "MAD",
    "United States": "USD", "USA": "USD", "New York": "USD",
}

CLIMATE_AS_OF = date(2026, 10, 1)

# (high, low, rain mm, rain days) per month, January first.
_CLIMATE = {
    "Tokyo": [
        (10, 2, 52, 5), (11, 3, 56, 6), (14, 6, 117, 9), (19, 11, 125, 10), (24, 16, 138, 10), (26, 19, 168, 12),
        (30, 23, 154, 9), (31, 25, 168, 8), (27, 21, 210, 10), (22, 15, 198, 10), (18, 9, 90, 6), (13, 4, 51, 5),
    ],
    "Lisbon": [
        (15, 8, 100, 10), (16, 9, 85, 9), (18, 10, 60, 8), (20, 12, 70, 9), (22, 14, 45, 7), (26, 17, 15, 3),
        (28, 18, 3, 1), (29, 19, 5, 1), (27, 18, 30, 4), (23, 15, 90, 8), (18, 11, 105, 10), (15, 9, 105, 10),
    ],
    "Paris": [
        (7, 3, 50, 10), (8, 3, 42, 9), (12, 5, 47, 9), (16, 7, 52, 9), (19, 11, 62, 10), (23, 14, 65, 9),
        (25, 16, 60, 8), (25, 16, 55, 8), (21, 13, 50, 8), (16, 10, 60, 10), (11, 6, 52, 10), (8, 4, 58, 11),
    ],
}
_CITY_OF = {
    "Japan": "Tokyo", "Portugal": "Lisbon", "France": "Paris",
}
_SUMMARY = {
    "cold": "Cold days and long evenings.",
    "cool": "Cool and changeable, with layers helpful all day.",
    "mild": "Mild days, mostly comfortable for walking.",
    "warm": "Warm and sunny, with light clothing most of the day.",
    "hot": "Hot days, so plan indoor breaks at midday.",
}


def _band(high: int) -> str:
    return "cold" if high < 10 else "cool" if high < 17 else "mild" if high < 23 else "warm" if high < 28 else "hot"


def currency_for(destination: str | None) -> str | None:
    country = _country(destination)
    return _CURRENCY.get(country) or _CURRENCY.get((destination or "").split(",", 1)[0].strip())


def typical_weather_for(destination: str | None, month: int) -> TypicalWeather | None:
    city = (destination or "").split(",", 1)[0].strip()
    table = _CLIMATE.get(city) or _CLIMATE.get(_CITY_OF.get(_country(destination), ""))
    if table is None or not 1 <= month <= 12:
        return None
    high, low, rain_mm, rain_days = table[month - 1]
    return TypicalWeather(
        month=month,
        summary=f"{_SUMMARY[_band(high)]} Highs around {high}°C, lows around {low}°C.",
        high_c=high,
        low_c=low,
        rain_mm=rain_mm,
        rain_days=rain_days,
        as_of=CLIMATE_AS_OF,
    )
