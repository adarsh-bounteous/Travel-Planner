from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Annotated, Protocol

from pydantic import BaseModel, Field, HttpUrl, StringConstraints

MAX_TRIP_DAYS = 60

TrimmedName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]


class Day(BaseModel):
    date: date
    name: TrimmedName


class DayName(BaseModel):
    name: TrimmedName


class ChosenOption(BaseModel):
    id: str
    title: str
    category: str
    date: date
    booking_url: HttpUrl | None = None


class TripFields(BaseModel):
    """What a traveller supplies for a Trip. The id and owner are never part of it."""

    name: TrimmedName
    destination: str | None = Field(default=None, max_length=120)
    start_date: date | None = None
    end_date: date | None = None
    budget: float | None = Field(default=None, ge=0, le=1_000_000_000)


class Trip(TripFields):
    id: str
    updated_at: datetime | None = None
    currency: str = "EUR"
    days: list[Day] = []
    options: list[ChosenOption] = []  # server-owned: never read from a request body


def reconcile_days(start: date | None, end: date | None, existing: list[Day]) -> list[Day]:
    """One Day per date from start to end. A date still in range keeps its Day (and name).

    Raises ValueError when the range is incomplete, backwards, or longer than MAX_TRIP_DAYS.
    """
    if start is None and end is None:
        return []
    if start is None or end is None or end < start:
        raise ValueError("invalid date range")
    count = (end - start).days + 1
    if count > MAX_TRIP_DAYS:
        raise ValueError("date range too long")
    kept = {d.date: d for d in existing}
    dates = [start + timedelta(days=i) for i in range(count)]
    return [kept.get(d) or Day(date=d, name=f"Day {i + 1}") for i, d in enumerate(dates)]


class TripStore(Protocol):
    """Trips in the Trip Database. Every lookup is keyed by the owner, so a trip id alone resolves nothing."""

    def list_trips(self, owner_id: str) -> list[Trip]: ...

    def get_trip(self, owner_id: str, trip_id: str) -> Trip | None: ...

    def save_trip(self, owner_id: str, trip: Trip) -> None: ...

    def delete_trip(self, owner_id: str, trip_id: str) -> None: ...


class InMemoryTripStore:
    def __init__(self) -> None:
        self._trips: dict[tuple[str, str], Trip] = {}

    def list_trips(self, owner_id: str) -> list[Trip]:
        return [t for (owner, _), t in self._trips.items() if owner == owner_id]

    def get_trip(self, owner_id: str, trip_id: str) -> Trip | None:
        return self._trips.get((owner_id, trip_id))

    def save_trip(self, owner_id: str, trip: Trip) -> None:
        self._trips[(owner_id, trip.id)] = trip

    def delete_trip(self, owner_id: str, trip_id: str) -> None:
        self._trips.pop((owner_id, trip_id), None)


class DynamoTripStore:
    def __init__(self, table_name: str) -> None:
        import boto3

        self._table = boto3.resource("dynamodb").Table(table_name)

    @staticmethod
    def _pk(owner_id: str) -> str:
        return f"USER#{owner_id}"

    def list_trips(self, owner_id: str) -> list[Trip]:
        items: list[dict] = []
        kwargs: dict = {
            "KeyConditionExpression": "pk = :pk AND begins_with(sk, :sk)",
            "ExpressionAttributeValues": {":pk": self._pk(owner_id), ":sk": "TRIP#"},
        }
        while True:
            page = self._table.query(**kwargs)
            items.extend(page.get("Items", []))
            if "LastEvaluatedKey" not in page:
                break
            kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]
        return [self._to_trip(item) for item in items]

    def get_trip(self, owner_id: str, trip_id: str) -> Trip | None:
        key = {"pk": self._pk(owner_id), "sk": f"TRIP#{trip_id}"}
        item = self._table.get_item(Key=key).get("Item")
        return self._to_trip(item) if item else None

    def save_trip(self, owner_id: str, trip: Trip) -> None:
        item = {
            k: v for k, v in trip.model_dump(mode="json").items() if v is not None
        }
        if trip.budget is not None:
            item["budget"] = Decimal(str(trip.budget))  # boto3 rejects floats
        self._table.put_item(
            Item={**item, "pk": self._pk(owner_id), "sk": f"TRIP#{trip.id}"}
        )

    def delete_trip(self, owner_id: str, trip_id: str) -> None:
        self._table.delete_item(Key={"pk": self._pk(owner_id), "sk": f"TRIP#{trip_id}"})

    @staticmethod
    def _to_trip(item: dict) -> Trip:
        data = {k: v for k, v in item.items() if k not in ("pk", "sk")}
        if "budget" in data:
            data["budget"] = float(data["budget"])
        return Trip.model_validate(data)
