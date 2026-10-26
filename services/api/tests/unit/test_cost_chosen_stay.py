from datetime import date
from decimal import Decimal

from app.trips.cost import FxRate, summarise_cost
from app.trips.rates import InMemoryRates
from app.trips.store import ChosenStay, DynamoTripStore, Stay, Trip

RATES = InMemoryRates({("GBP", "EUR"): Decimal("1.2")})


def chosen(total="480", currency="EUR") -> ChosenStay:
    return ChosenStay(
        property_id="p",
        name="Casa",
        provider="BN",
        url="https://x.example/p",
        total=Decimal(total),
        currency=currency,
    )


def trip(choice: ChosenStay | None) -> Trip:
    stay = Stay(id="s", place="Lisbon", start_date=date(2027, 1, 1), end_date=date(2027, 1, 5), chosen=choice)
    return Trip(id="t", name="T", currency="EUR", stays=[stay])


def test_total_includes_the_chosen_stay_and_drops_when_cleared():
    t = trip(chosen())
    assert summarise_cost(t, RATES).total == 480.0
    t.stays[0].chosen = None
    assert summarise_cost(t, RATES).total == 0.0


def test_foreign_currency_stay_is_converted_and_reported():
    summary = summarise_cost(trip(chosen("100", "GBP")), RATES)
    assert summary.total == 120.0
    assert summary.rates == [FxRate(currency="GBP", rate=1.2)]


def test_unconvertible_stay_adds_nothing_and_is_counted():
    summary = summarise_cost(trip(chosen("100", "JPY")), RATES)
    assert summary.total == 0.0 and summary.unconvertible_count == 1


def test_stored_stay_without_chosen_still_loads():
    t = DynamoTripStore._to_trip(
        {
            "pk": "USER#u",
            "sk": "TRIP#t",
            "id": "t",
            "name": "T",
            "stays": [{"id": "s", "place": "Lisbon", "start_date": "2027-01-01", "end_date": "2027-01-05"}],
        }
    )
    assert t.stays[0].chosen is None


def test_chosen_stay_round_trips_as_json():
    again = Trip.model_validate(trip(chosen()).model_dump(mode="json"))
    assert again.stays[0].chosen.total == Decimal("480")
