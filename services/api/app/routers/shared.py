from datetime import date
from datetime import date as Date
from decimal import Decimal

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel

from app.routers.deps import ApiError, get_rates, get_today, get_trips, get_visa_rules
from app.trips.itinerary import Itinerary, build_itinerary, redact_for_share
from app.trips.rates import RateSource
from app.trips.visa import VisaRuleSource
from app.trips.store import Activity, Day, Meal, TripStore

router = APIRouter(prefix="/shared")

NOT_FOUND = ApiError(404, "not_found")


class SharedOption(BaseModel):
    """A chosen option as a read-only viewer sees it: no booking link."""

    title: str
    category: str
    date: date
    price: Decimal | None = None
    currency: str | None = None


class SharedRestaurant(BaseModel):
    """A restaurant pick as a read-only viewer sees it: no link."""

    id: str
    name: str
    city: str
    cuisine: str
    typical_price: Decimal | None = None
    currency: str
    date: Date | None = None  # the field name shadows the type here
    meal: Meal | None = None


class SharedTrip(BaseModel):
    """The itinerary behind a read-only link. An allow-list, so a field added to Trip later stays private."""

    name: str
    destination: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    currency: str
    days: list[Day]
    options: list[SharedOption]
    activities: list[Activity]
    restaurants: list[SharedRestaurant]
    is_owner: bool = False
    can_edit: bool = False
    itinerary_shared: bool = False
    itinerary: Itinerary | None = None  # the complete document, only when the owner switched it on


@router.get("/{token}")
def read_shared_trip(
    token: str,
    response: Response,
    trips: TripStore = Depends(get_trips),
    visa_rules: VisaRuleSource = Depends(get_visa_rules),
    today: date = Depends(get_today),
    rates: RateSource = Depends(get_rates),
) -> SharedTrip:
    """Public: the token is the credential. A turned-off, unknown or orphaned token all answer the same 404."""
    link = trips.get_share_link(token)
    trip = trips.get_trip(link.owner_id, link.trip_id) if link else None
    if trip is None or trip.share_token != token:  # the Trip item decides access, not the index
        raise NOT_FOUND
    response.headers["Cache-Control"] = "no-store"
    if not trip.share_itinerary:  # nothing of the plan leaves the server while the itinerary is Off
        return SharedTrip(
            name=trip.name,
            destination=trip.destination,
            start_date=trip.start_date,
            end_date=trip.end_date,
            currency=trip.currency,
            days=[],
            options=[],
            activities=[],
            restaurants=[],
        )
    # No owner profile, as on the editor path: its answers are private.
    document = redact_for_share(build_itinerary(trip, None, visa_rules, today, rates))
    return SharedTrip(
        **trip.model_dump(include=set(SharedTrip.model_fields) - {"options", "restaurants", "itinerary", "itinerary_shared"}),
        itinerary_shared=True,
        itinerary=document,
        options=[SharedOption(**o.model_dump()) for o in trip.options],  # extra fields (id, booking_url) are dropped
        restaurants=[SharedRestaurant(**r.model_dump(exclude={"url"})) for r in trip.restaurants],
    )
