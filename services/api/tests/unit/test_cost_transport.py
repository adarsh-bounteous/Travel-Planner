from datetime import date
from decimal import Decimal

from app.trips.cost import FxRate, summarise_cost
from app.trips.rates import InMemoryRates
from app.trips.store import DynamoTripStore, Trip, TransportPick

RATES = InMemoryRates({("GBP", "EUR"): Decimal("1.2")})


def pick(fare="180", currency="EUR", mode="flight", estimate=False, leg="destination") -> TransportPick:
    return TransportPick(
        leg=leg,
        option_id=f"{leg}-1",
        mode=mode,
        provider="P",
        origin="A",
        destination="B",
        date=date(2027, 1, 1),
        estimate=estimate,
        fare=Decimal(fare),
        picked_fare=Decimal(fare),
        currency=currency,
        url="https://x.example/p",
    )


def trip(*picks) -> Trip:
    return Trip(id="t", name="T", currency="EUR", transport=list(picks))


def test_total_includes_fare_and_taxi_estimate_and_drops_when_cleared():
    assert summarise_cost(trip(pick("180")), RATES).total == 180.0
    assert summarise_cost(trip(pick("25", mode="taxi", estimate=True)), RATES).total == 25.0
    t = trip(pick("180"), pick("25", leg="local_taxi"))
    assert summarise_cost(t, RATES).total == 205.0
    t.transport = []
    assert summarise_cost(t, RATES).total == 0.0


def test_foreign_currency_pick_is_converted_and_reported():
    summary = summarise_cost(trip(pick("100", "GBP")), RATES)
    assert summary.total == 120.0 and summary.rates == [FxRate(currency="GBP", rate=1.2)]


def test_unconvertible_pick_adds_nothing_and_is_counted():
    summary = summarise_cost(trip(pick("100", "JPY")), RATES)
    assert summary.total == 0.0 and summary.unconvertible_count == 1


def test_stored_trip_without_transport_loads():
    t = DynamoTripStore._to_trip({"pk": "USER#u", "sk": "TRIP#t", "id": "t", "name": "T"})
    assert t.transport == []
    again = Trip.model_validate_json(trip(pick()).model_dump_json())
    assert again.transport[0].fare == Decimal("180")
