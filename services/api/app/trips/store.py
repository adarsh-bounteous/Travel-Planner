from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Annotated, Literal, Protocol

from pydantic import BaseModel, Field, HttpUrl, StringConstraints, model_validator

from app.trips.profile_store import Mode

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
    price: Decimal | None = None
    currency: str | None = None  # None means the trip's currency


class TripFields(BaseModel):
    """What a traveller supplies for a Trip. The id and owner are never part of it."""

    name: TrimmedName
    destination: str | None = Field(default=None, max_length=120)
    start_date: date | None = None
    end_date: date | None = None
    budget: float | None = Field(default=None, ge=0, le=1_000_000_000)


class TripCreate(TripFields):
    """What New trip set-up supplies: every basic is required, and the trip currency is chosen here."""

    destination: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
    start_date: date
    end_date: date
    budget: float = Field(gt=0, le=1_000_000_000)
    currency: Literal["EUR", "GBP", "USD", "JPY", "AUD"]
    traveller_count: int = Field(ge=1, le=20)


ReminderText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=280)]


class ReminderFields(BaseModel):
    """What an editor supplies for a Reminder. option_id None means the whole trip."""

    text: ReminderText
    date: date
    option_id: str | None = None


class Reminder(ReminderFields):
    id: str
    option_date: date | None = None  # the option's day when attached; hides the note if the option later moves


class ActivityFields(BaseModel):
    """What an editor supplies for an Activity: a name on one day of the trip."""

    name: TrimmedName
    date: date
    detail: str | None = Field(default=None, max_length=120)


class ActivityMove(BaseModel):
    date: date


class Activity(ActivityFields):
    id: str


class StayFields(BaseModel):
    """What an editor supplies for a Stay: a place and the dates spent there."""

    place: TrimmedName
    start_date: date
    end_date: date

    @model_validator(mode="after")
    def _end_not_before_start(self) -> "StayFields":
        if self.end_date < self.start_date:
            raise ValueError("end_date is before start_date")
        return self


class ChosenStay(BaseModel):
    """The stay picked from a Stay's shortlist: a snapshot of the lowest offer, priced for the Stay's nights."""

    property_id: str
    name: str
    provider: str
    url: HttpUrl  # the offer's booking page on the provider's site
    total: Decimal
    currency: str  # the offer's currency; may differ from the trip currency


class Stay(StayFields):
    id: str
    chosen: ChosenStay | None = None  # server-owned: changed only through the chosen-stay routes


TransportLeg = Literal["destination", "between_cities", "local_taxi"]


class TransportPick(BaseModel):
    leg: TransportLeg
    option_id: str
    mode: Mode
    provider: str
    origin: str
    destination: str
    date: date
    estimate: bool = False  # taxi fares are estimates
    fare: Decimal  # the current fare, refreshed from the provider
    picked_fare: Decimal  # the fare when it was picked
    currency: str  # may differ from the trip currency
    url: HttpUrl  # the provider's booking page


class TripPlaceFields(BaseModel):
    place_id: str = Field(min_length=1, max_length=120)
    name: TrimmedName
    image_url: str | None = Field(default=None, max_length=500)


class TripPlace(TripPlaceFields):
    id: str


class TravellerFields(BaseModel):
    name: TrimmedName


# The same options the web offers (apps/web/src/trips/profileQuestions.ts); anything else is refused.
Country = Literal[
    "Australia",
    "Canada",
    "France",
    "Germany",
    "India",
    "Ireland",
    "Japan",
    "Portugal",
    "United Kingdom",
    "United States",
]
HealthStatus = Literal["No health needs to share", "Mobility needs", "Chronic condition", "Allergies"]


class CompanionDetails(BaseModel):
    """What the owner supplies for an additional traveller. They live on the trip only, never in a profile."""

    citizenship: Country
    residence: Country
    health_status: HealthStatus


class Traveller(TravellerFields):
    id: str
    citizenship: str = ""
    residence: str = ""
    health_status: str = ""


class Editor(BaseModel):
    """A companion invited to change the plan. The token is the owner's to share, never shown to editors."""

    email: str  # lower-cased
    token: str
    accepted: bool = False


class Invite(BaseModel):
    """Index record that finds the trip behind an invite link."""

    token: str
    owner_id: str
    trip_id: str
    email: str


class ShareLink(BaseModel):
    """Index record that finds the trip behind a read-only link."""

    token: str
    owner_id: str
    trip_id: str


class Trip(TripFields):
    id: str
    updated_at: datetime | None = None
    currency: str = "EUR"
    traveller_count: int | None = None  # how many are going; set at New trip set-up, the named people are `travellers`
    days: list[Day] = []
    options: list[ChosenOption] = []  # server-owned: never read from a request body
    reminders: list[Reminder] = []  # server-owned: changed only through the reminder routes
    activities: list[Activity] = []  # server-owned, apart from options so Book trip is unaffected
    stays: list[Stay] = []  # server-owned: changed only through the stay routes
    transport: list[TransportPick] = []  # server-owned: changed only through the transport routes
    places: list[TripPlace] = []  # server-owned: changed only through the place route; unscheduled (no date)
    travellers: list[Traveller] = []  # server-owned: changed only through the traveller route
    editors: list[Editor] = []  # server-owned: changed only through the editor routes
    needed_categories: list[str] = []  # server-owned: categories the traveller needs a pick for
    share_token: str | None = None  # server-owned: changed only through the share-link routes


def visible_reminders(trip: Trip) -> list[Reminder]:
    """Trip reminders, plus activity reminders whose option is still on the day it was attached on."""
    days = {o.id: o.date for o in trip.options}
    return [
        r for r in trip.reminders if r.option_id is None or days.get(r.option_id) == r.option_date
    ]


def can_edit_trip(trip: Trip, user_id: str, owner_id: str, email: str | None = None) -> bool:
    """The single rule for changing a trip's itinerary: the owner, or an editor whose accepted email is on the trip."""
    if user_id == owner_id:
        return True
    return email is not None and any(
        e.accepted and e.email == email.strip().lower() for e in trip.editors
    )


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

    def save_invite(self, invite: Invite) -> None: ...

    def get_invite(self, token: str) -> Invite | None: ...

    def delete_invite(self, token: str) -> None: ...

    def save_share_link(self, link: ShareLink) -> None: ...

    def get_share_link(self, token: str) -> ShareLink | None: ...

    def delete_share_link(self, token: str) -> None: ...

    def link_editor(self, email: str, owner_id: str, trip_id: str) -> None:
        """Index that lets an editor find the owner's partition. The Trip's own editors list still decides access."""

    def unlink_editor(self, email: str, trip_id: str) -> None: ...

    def shared_trips(self, email: str) -> list[tuple[str, str]]:
        """(owner id, trip id) pairs the email may have been linked to; callers re-check the Trip."""


class InMemoryTripStore:
    def __init__(self) -> None:
        self._trips: dict[tuple[str, str], Trip] = {}
        self._invites: dict[str, Invite] = {}
        self._share_links: dict[str, ShareLink] = {}
        self._editors: dict[tuple[str, str], str] = {}

    def list_trips(self, owner_id: str) -> list[Trip]:
        return [t for (owner, _), t in self._trips.items() if owner == owner_id]

    def get_trip(self, owner_id: str, trip_id: str) -> Trip | None:
        return self._trips.get((owner_id, trip_id))

    def save_trip(self, owner_id: str, trip: Trip) -> None:
        self._trips[(owner_id, trip.id)] = trip

    def delete_trip(self, owner_id: str, trip_id: str) -> None:
        self._trips.pop((owner_id, trip_id), None)

    def save_invite(self, invite: Invite) -> None:
        self._invites[invite.token] = invite

    def get_invite(self, token: str) -> Invite | None:
        return self._invites.get(token)

    def delete_invite(self, token: str) -> None:
        self._invites.pop(token, None)

    def save_share_link(self, link: ShareLink) -> None:
        self._share_links[link.token] = link

    def get_share_link(self, token: str) -> ShareLink | None:
        return self._share_links.get(token)

    def delete_share_link(self, token: str) -> None:
        self._share_links.pop(token, None)

    def link_editor(self, email: str, owner_id: str, trip_id: str) -> None:
        self._editors[(email, trip_id)] = owner_id

    def unlink_editor(self, email: str, trip_id: str) -> None:
        self._editors.pop((email, trip_id), None)

    def shared_trips(self, email: str) -> list[tuple[str, str]]:
        return [(owner, tid) for (e, tid), owner in self._editors.items() if e == email]


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

    def save_invite(self, invite: Invite) -> None:
        self._table.put_item(Item={**invite.model_dump(), "pk": f"INVITE#{invite.token}", "sk": "INVITE"})

    def get_invite(self, token: str) -> Invite | None:
        item = self._table.get_item(Key={"pk": f"INVITE#{token}", "sk": "INVITE"}).get("Item")
        return Invite.model_validate({k: v for k, v in item.items() if k not in ("pk", "sk")}) if item else None

    def delete_invite(self, token: str) -> None:
        self._table.delete_item(Key={"pk": f"INVITE#{token}", "sk": "INVITE"})

    def save_share_link(self, link: ShareLink) -> None:
        self._table.put_item(Item={**link.model_dump(), "pk": f"SHARE#{link.token}", "sk": "SHARE"})

    def get_share_link(self, token: str) -> ShareLink | None:
        item = self._table.get_item(Key={"pk": f"SHARE#{token}", "sk": "SHARE"}).get("Item")
        return ShareLink.model_validate({k: v for k, v in item.items() if k not in ("pk", "sk")}) if item else None

    def delete_share_link(self, token: str) -> None:
        self._table.delete_item(Key={"pk": f"SHARE#{token}", "sk": "SHARE"})

    def link_editor(self, email: str, owner_id: str, trip_id: str) -> None:
        self._table.put_item(
            Item={"pk": f"EDITOR#{email}", "sk": f"TRIP#{trip_id}", "owner_id": owner_id}
        )

    def unlink_editor(self, email: str, trip_id: str) -> None:
        self._table.delete_item(Key={"pk": f"EDITOR#{email}", "sk": f"TRIP#{trip_id}"})

    def shared_trips(self, email: str) -> list[tuple[str, str]]:
        page = self._table.query(
            KeyConditionExpression="pk = :pk AND begins_with(sk, :sk)",
            ExpressionAttributeValues={":pk": f"EDITOR#{email}", ":sk": "TRIP#"},
        )
        return [(i["owner_id"], i["sk"].removeprefix("TRIP#")) for i in page.get("Items", [])]

    @staticmethod
    def _to_trip(item: dict) -> Trip:
        data = {k: v for k, v in item.items() if k not in ("pk", "sk")}
        if "budget" in data:
            data["budget"] = float(data["budget"])
        return Trip.model_validate(data)
