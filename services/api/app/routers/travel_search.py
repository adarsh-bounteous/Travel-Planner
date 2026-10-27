from datetime import date

from fastapi import APIRouter, Depends, Query

from app.config import get_settings
from app.flights.options import FlightProvider
from app.routers.deps import (
    ApiError,
    get_current_user,
    get_flight_providers,
    get_stay_providers,
    get_transport_providers,
    require_local_mode,
)
from app.stays.options import StayProvider
from app.transport.options import TransportProvider
from app.travel.local import Kind
from app.travel.search import (
    BookingPreview,
    ReturnBeforeDepartError,
    TravelSearchResult,
    booking_preview,
    search_travel,
)

router = APIRouter(prefix="/travel-search")


@router.get("")
def search(
    type: Kind,
    destination: str,
    depart: date,
    return_: date = Query(alias="return"),
    route: str = "",
    _: str = Depends(get_current_user),
    stays: list[StayProvider] = Depends(get_stay_providers),
    flights: list[FlightProvider] = Depends(get_flight_providers),
    transports: list[TransportProvider] = Depends(get_transport_providers),
) -> TravelSearchResult:
    """Options for one stay, flight or transport search: generated in local mode, else from the real providers."""
    try:
        return search_travel(
            type,
            destination,
            depart,
            return_,
            route,
            stays=stays,
            flights=flights,
            transports=transports,
            local=get_settings().local_mode,
        )
    except ReturnBeforeDepartError:
        raise ApiError(422, "return_before_depart")


@router.get("/booking")
def booking(ref: str, _: str = Depends(get_current_user)) -> BookingPreview:
    """The option a local booking link points at, for the pretend booking page. 404 with local mode off."""
    require_local_mode()
    preview = booking_preview(ref)
    if preview is None:
        raise ApiError(404, "not_found")
    return preview
