from typing import Annotated, Literal, Protocol

from pydantic import BaseModel, Field, StringConstraints, model_validator

Mode = Literal["flight", "train", "bus", "taxi"]
Cabin = Literal["economy", "premium_economy", "business"]
DepartureWindow = Literal["morning", "afternoon", "evening", "night"]


class TransportPreferences(BaseModel):
    """How a traveller likes to travel. Every part is optional; an unset part never excludes an option."""

    modes: list[Mode] = Field(default_factory=list, max_length=4)
    cabin: Cabin | None = None
    departure_window: DepartureWindow | None = None
    max_stops: int | None = Field(default=None, ge=0, le=10)
    providers: list[Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]] = (
        Field(default_factory=list, max_length=20)
    )

    @model_validator(mode="after")
    def _no_duplicate_providers(self) -> "TransportPreferences":
        names = [p.casefold() for p in self.providers]
        if len(set(names)) != len(names):
            raise ValueError("providers must not repeat")
        return self


class Profile(BaseModel):
    """A traveller's profile. One per account."""

    display_name: str = Field(default="", max_length=80)
    home_city: str = Field(default="", max_length=80)
    dietary_notes: str = Field(default="", max_length=500)
    # Answers collected in New trip set-up. An answer counts as given when it is non-empty.
    citizenship: str = Field(default="", max_length=80)
    residence: str = Field(default="", max_length=80)
    health_status: str = Field(default="", max_length=80)
    # Optional health details read by medical guidance; collected in the Traveller profile epic.
    vaccinations_had: list[Annotated[str, StringConstraints(max_length=60)]] = Field(
        default_factory=list, max_length=30
    )
    pregnant: bool | None = None  # None = not provided
    religion: str = Field(default="", max_length=80)
    diet: str = Field(default="", max_length=80)
    tastes: list[Annotated[str, StringConstraints(max_length=40)]] = Field(
        default_factory=list, max_length=20
    )
    travel_style: str = Field(default="", max_length=80)
    transport_preferences: TransportPreferences = Field(default_factory=TransportPreferences)
    sim_preference: Literal["esim", "physical"] | None = None  # None = no preference; only then SIM type never reorders


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

    def reset(self) -> None:
        self._profiles.clear()


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
