import logging
from concurrent.futures import ThreadPoolExecutor, wait
from datetime import date, datetime, time
from decimal import Decimal
from typing import Literal, Protocol

from pydantic import BaseModel

from app.trips.profile_store import Cabin

logger = logging.getLogger(__name__)

FLIGHT_SOURCE_TIMEOUT_SECONDS = 5.0
SourceStatus = Literal["ok", "failed", "timed_out"]


class FlightOption(BaseModel):
    """One flight on one leg, with the fare as fetched."""

    id: str
    provider: str  # the airline shown on the card
    source: str  # "Flight search API" | "Web search" | "Partner API"
    fare: Decimal
    currency: str
    travel_minutes: int
    stops: int
    departs: time | None = None
    cabin: Cabin | None = None
    deal: str | None = None
    fetched_at: datetime  # drives "indicative as of ..."
    url: str


class FlightProvider(Protocol):
    """Where flights come from. A real Flight and Hotel Search adapter implements this port."""

    name: str

    def fetch(self, origin: str, destination: str, on: date) -> list[FlightOption]: ...


class SourceResult(BaseModel):
    name: str
    status: SourceStatus


def gather_flights(
    providers: list[FlightProvider],
    origin: str,
    destination: str,
    on: date,
    timeout: float = FLIGHT_SOURCE_TIMEOUT_SECONDS,
) -> tuple[list[FlightOption], list[SourceResult]]:
    """Ask every source at once. One that raises or is still running at the deadline is skipped and reported."""
    pool = ThreadPoolExecutor(max_workers=max(1, len(providers)))
    futures = [pool.submit(p.fetch, origin, destination, on) for p in providers]
    # A slow source must not hold the response past the deadline, so never wait for its thread.
    done, _ = wait(futures, timeout=timeout)
    pool.shutdown(wait=False, cancel_futures=True)
    flights: list[FlightOption] = []
    sources: list[SourceResult] = []
    for provider, future in zip(providers, futures):
        if future not in done:
            sources.append(SourceResult(name=provider.name, status="timed_out"))
        elif future.exception() is not None:
            logger.error("flight provider %s failed", provider.name, exc_info=future.exception())
            sources.append(SourceResult(name=provider.name, status="failed"))
        else:
            flights.extend(future.result())
            sources.append(SourceResult(name=provider.name, status="ok"))
    return flights, sources
