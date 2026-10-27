from collections.abc import Callable
import logging
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Protocol
from uuid import uuid4

from app.trips.store import Trip, TripStore, reconcile_days

DEMO_EMAIL = "demo@example.com"
DEMO_PASSWORD = "demo-password-1"  # local use only; must satisfy app.auth.password.validate_password

DAYS_UNTIL_FIRST_TRIP = 30

# (name, destination, nights, days after the previous trip ends, budget, currency, traveller count, interests)
_SAMPLE_TRIPS = (
    ("Weekend in Lisbon", "Lisbon", 3, 0, 900, "EUR", 2, ("Food", "Culture", "Outdoors")),
    ("Summer in Kyoto", "Kyoto", 10, 30, 3200, "USD", 1, ("Culture", "Nature")),
)


class SeedableIdentity(Protocol):
    def create_confirmed_user(self, email: str, password: str) -> str:
        """Create an already-confirmed account and return its user id."""

    def account_exists(self, email: str) -> bool: ...

    def user_id_for(self, email: str) -> str: ...


@dataclass(frozen=True)
class LocalSeedTarget:
    """The local stores seeding reads and writes, and the probe that says they hold nothing."""

    is_empty: Callable[[], bool]
    identity: SeedableIdentity
    trips: TripStore


def _sample_trips(today: date) -> list[Trip]:
    trips = []
    start = today + timedelta(days=DAYS_UNTIL_FIRST_TRIP)
    for name, destination, nights, gap, budget, currency, travellers, interests in _SAMPLE_TRIPS:
        start += timedelta(days=gap)
        end = start + timedelta(days=nights)
        trips.append(
            Trip(
                id=uuid4().hex,
                name=name,
                destination=destination,
                start_date=start,
                end_date=end,
                budget=budget,
                currency=currency,
                traveller_count=travellers,
                interests=list(interests),
                days=reconcile_days(start, end, []),
            )
        )
        start = end
    return trips


def seed_demo_data(
    *,
    is_empty: Callable[[], bool],
    identity: SeedableIdentity,
    trips: TripStore,
    today: date,
) -> bool:
    """Ensure the demo user exists and seed sample trips only when the trips are empty.

    Accounts can outlive an API restart while trips do not, so the user is created only when
    missing. Returns True when it seeded trips, False when it did nothing to them. Nothing is
    ever updated once seeded, so a restart keeps edits and never duplicates.
    """
    if not is_empty():
        return False
    if identity.account_exists(DEMO_EMAIL):
        user_id = identity.user_id_for(DEMO_EMAIL)
    else:
        user_id = identity.create_confirmed_user(DEMO_EMAIL, DEMO_PASSWORD)
    for trip in _sample_trips(today):
        trips.save_trip(user_id, trip)
    return True


def run_first_start_seed(target: LocalSeedTarget | None, today: date) -> bool:
    """Seed on a local start. Without local stores (the storage and sign-in work is pending) it does nothing."""
    if target is None:
        logging.getLogger(__name__).warning(
            "Local mode is on but there are no local stores yet, so demo data was not seeded."
        )
        return False
    return seed_demo_data(
        is_empty=target.is_empty, identity=target.identity, trips=target.trips, today=today
    )
