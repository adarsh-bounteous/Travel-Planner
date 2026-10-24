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
