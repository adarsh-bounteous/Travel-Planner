from datetime import date
from decimal import Decimal

from app.trips.rates import LastKnownRates


def test_remembers_the_latest_rate_with_its_date():
    seen = LastKnownRates()
    assert seen.get("JPY", "EUR") is None
    seen.remember("JPY", "EUR", Decimal("0.0060"), date(2026, 10, 1))
    seen.remember("JPY", "EUR", Decimal("0.0061"), date(2026, 10, 14))
    assert seen.get("JPY", "EUR") == (Decimal("0.0061"), date(2026, 10, 14))
    assert seen.get("EUR", "JPY") is None
