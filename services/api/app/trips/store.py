from datetime import date, datetime
from typing import Protocol

from pydantic import BaseModel, Field


class TripFields(BaseModel):
    """What a traveller supplies for a Trip. The id and owner are never part of it."""

    name: str = Field(min_length=1, max_length=120)
    destination: str | None = Field(default=None, max_length=120)
    start_date: date | None = None
    end_date: date | None = None


class Trip(TripFields):
    id: str
    updated_at: datetime | None = None


class TripStore(Protocol):
    """Trips in the Trip Database. Every lookup is keyed by the owner, so a trip id alone resolves nothing."""

    def list_trips(self, owner_id: str) -> list[Trip]: ...

    def get_trip(self, owner_id: str, trip_id: str) -> Trip | None: ...

    def save_trip(self, owner_id: str, trip: Trip) -> None: ...


class InMemoryTripStore:
    def __init__(self) -> None:
        self._trips: dict[tuple[str, str], Trip] = {}

    def list_trips(self, owner_id: str) -> list[Trip]:
        return [t for (owner, _), t in self._trips.items() if owner == owner_id]

    def get_trip(self, owner_id: str, trip_id: str) -> Trip | None:
        return self._trips.get((owner_id, trip_id))

    def save_trip(self, owner_id: str, trip: Trip) -> None:
        self._trips[(owner_id, trip.id)] = trip


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
        self._table.put_item(
            Item={**item, "pk": self._pk(owner_id), "sk": f"TRIP#{trip.id}"}
        )

    @staticmethod
    def _to_trip(item: dict) -> Trip:
        return Trip.model_validate({k: v for k, v in item.items() if k not in ("pk", "sk")})
