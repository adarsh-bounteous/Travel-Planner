import hashlib
from datetime import datetime
from decimal import Decimal

from app.locations.resolver import ResolvedLocation


class InMemoryLocationCache:
    def __init__(self) -> None:
        self._entries: dict[str, tuple[ResolvedLocation, datetime]] = {}

    def get(self, key: str) -> tuple[ResolvedLocation, datetime] | None:
        return self._entries.get(key)

    def put(self, key: str, location: ResolvedLocation, resolved_at: datetime) -> None:
        self._entries[key] = (location, resolved_at)


def decimals(value):
    """The value with every float as a Decimal: boto3 rejects floats."""
    if isinstance(value, float):
        return Decimal(str(value))
    if isinstance(value, dict):
        return {k: decimals(v) for k, v in value.items()}
    if isinstance(value, list):
        return [decimals(v) for v in value]
    return value


class DynamoLocationCache:
    """Resolved locations kept in the trips table as `GEOCODE#<hash of the key>` items."""

    def __init__(self, table_name: str) -> None:
        import boto3

        self._table = boto3.resource("dynamodb").Table(table_name)

    @staticmethod
    def _pk(key: str) -> str:
        return f"GEOCODE#{hashlib.sha256(key.encode()).hexdigest()}"

    def get(self, key: str) -> tuple[ResolvedLocation, datetime] | None:
        try:
            item = self._table.get_item(Key={"pk": self._pk(key), "sk": "GEOCODE"}).get("Item")
            if not item:
                return None
            location = ResolvedLocation.model_validate(item["location"])  # Decimals read as floats
            return location, datetime.fromisoformat(item["resolved_at"])
        except Exception:  # a cache that cannot be read is a miss, never a failed save
            return None

    def put(self, key: str, location: ResolvedLocation, resolved_at: datetime) -> None:
        self._table.put_item(
            Item={
                "pk": self._pk(key),
                "sk": "GEOCODE",
                "location": decimals(location.model_dump(mode="json")),
                "resolved_at": resolved_at.isoformat(),
            }
        )
