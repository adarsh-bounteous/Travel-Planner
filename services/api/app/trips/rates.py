from datetime import date
from decimal import Decimal
from typing import Protocol


class RateSource(Protocol):
    """Where exchange rates come from. A real provider adapter implements this port."""

    def rate(self, from_currency: str, to_currency: str) -> Decimal | None:
        """How many `to_currency` one `from_currency` buys, or None when the pair is unknown."""


class InMemoryRates:
    def __init__(self, table: dict[tuple[str, str], Decimal]) -> None:
        self._table = table

    def rate(self, from_currency: str, to_currency: str) -> Decimal | None:
        if from_currency == to_currency:
            return Decimal(1)
        return self._table.get((from_currency, to_currency))


# Seeded default until an exchange-rate provider is chosen.
SEED_RATES = {("USD", "EUR"): Decimal("0.92")}


# Local mode's fixed rate table: how many of each currency 1 EUR buys. A stand-in for the outside
# rates service, so local mode never calls it. Order is the display order everywhere.
LOCAL_RATES_PER_EUR = {
    "EUR": Decimal(1),
    "USD": Decimal("1.08"),
    "GBP": Decimal("0.85"),
    "JPY": Decimal(160),
    "AUD": Decimal("1.65"),
}
OFFERED_CURRENCIES = tuple(LOCAL_RATES_PER_EUR)


class LocalRates:
    def rate(self, from_currency: str, to_currency: str) -> Decimal | None:
        source = LOCAL_RATES_PER_EUR.get(from_currency.upper())
        target = LOCAL_RATES_PER_EUR.get(to_currency.upper())
        if source is None or target is None:
            return None
        return target / source


class RateUnavailable(Exception):
    """A rate provider could not be reached, as opposed to the pair being unknown (None)."""


class LastKnownRates:
    """Remembers the latest successful rate per currency pair, with the date it was seen."""

    def __init__(self) -> None:
        self._seen: dict[tuple[str, str], tuple[Decimal, date]] = {}

    def remember(self, from_currency: str, to_currency: str, rate: Decimal, on: date) -> None:
        self._seen[(from_currency, to_currency)] = (rate, on)

    def get(self, from_currency: str, to_currency: str) -> tuple[Decimal, date] | None:
        return self._seen.get((from_currency, to_currency))
