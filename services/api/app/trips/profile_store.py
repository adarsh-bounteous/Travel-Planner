from typing import Protocol

from pydantic import BaseModel, Field


class Profile(BaseModel):
    """A traveller's profile. One per account."""

    display_name: str = Field(default="", max_length=80)
    home_city: str = Field(default="", max_length=80)
    dietary_notes: str = Field(default="", max_length=500)


class ProfileStore(Protocol):
    def get_profile(self, owner_id: str) -> Profile | None: ...

    def save_profile(self, owner_id: str, profile: Profile) -> None: ...


class InMemoryProfileStore:
    def __init__(self) -> None:
        self._profiles: dict[str, Profile] = {}

    def get_profile(self, owner_id: str) -> Profile | None:
        return self._profiles.get(owner_id)

    def save_profile(self, owner_id: str, profile: Profile) -> None:
        self._profiles[owner_id] = profile


class DynamoProfileStore:
    """Keeps the profile as a `profile` map on the traveller's account item."""

    def __init__(self, table_name: str) -> None:
        import boto3

        self._table = boto3.resource("dynamodb").Table(table_name)

    @staticmethod
    def _key(owner_id: str) -> dict[str, str]:
        return {"pk": f"USER#{owner_id}"}

    def get_profile(self, owner_id: str) -> Profile | None:
        item = self._table.get_item(Key=self._key(owner_id)).get("Item", {})
        data = item.get("profile")
        return Profile.model_validate(data) if data else None

    def save_profile(self, owner_id: str, profile: Profile) -> None:
        self._table.update_item(
            Key=self._key(owner_id),
            UpdateExpression="SET profile = :p",
            ExpressionAttributeValues={":p": profile.model_dump()},
        )
