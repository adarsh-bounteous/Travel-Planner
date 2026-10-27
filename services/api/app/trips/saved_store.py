import json
from decimal import Decimal
from typing import Protocol

from app.places.search import Place


class SavedPlaceStore(Protocol):
    """A traveller's saved places. Account-wide, never tied to a trip."""

    def list_saved(self, owner_id: str) -> list[Place]: ...

    def save(self, owner_id: str, place: Place) -> None: ...

    def unsave(self, owner_id: str, place_id: str) -> None: ...


class InMemorySavedPlaceStore:
    def __init__(self) -> None:
        self._saved: dict[str, dict[str, Place]] = {}

    def list_saved(self, owner_id: str) -> list[Place]:
        return list(self._saved.get(owner_id, {}).values())

    def save(self, owner_id: str, place: Place) -> None:
        self._saved.setdefault(owner_id, {})[place.id] = place

    def unsave(self, owner_id: str, place_id: str) -> None:
        self._saved.get(owner_id, {}).pop(place_id, None)

    def reset(self) -> None:
        self._saved.clear()


class DynamoSavedPlaceStore:
    """Keeps a `saved_places` map (place id to a snapshot of the place) on the account item.

    The snapshot is stored because the saved map needs lat/lng and the catalogue is looked up by
    destination, not by id. Updates touch only that map, never the profile or credentials.
    """

    def __init__(self, table_name: str) -> None:
        import boto3

        self._table = boto3.resource("dynamodb").Table(table_name)

    @staticmethod
    def _key(owner_id: str) -> dict[str, str]:
        return {"pk": f"USER#{owner_id}"}

    def list_saved(self, owner_id: str) -> list[Place]:
        item = self._table.get_item(Key=self._key(owner_id)).get("Item", {})
        return [Place.model_validate(data) for data in item.get("saved_places", {}).values()]

    def _ensure_map(self, owner_id: str) -> None:
        """A nested `saved_places.#id` path is invalid until the map itself exists."""
        self._table.update_item(
            Key=self._key(owner_id),
            UpdateExpression="SET saved_places = if_not_exists(saved_places, :empty)",
            ExpressionAttributeValues={":empty": {}},
        )

    def save(self, owner_id: str, place: Place) -> None:
        # DynamoDB rejects floats, so numbers go in as Decimal.
        data = json.loads(place.model_dump_json(), parse_float=Decimal)
        self._ensure_map(owner_id)
        self._table.update_item(
            Key=self._key(owner_id),
            UpdateExpression="SET saved_places.#id = :p",
            ExpressionAttributeNames={"#id": place.id},
            ExpressionAttributeValues={":p": data},
        )

    def unsave(self, owner_id: str, place_id: str) -> None:
        self._ensure_map(owner_id)
        self._table.update_item(
            Key=self._key(owner_id),
            UpdateExpression="REMOVE saved_places.#id",
            ExpressionAttributeNames={"#id": place_id},
        )
