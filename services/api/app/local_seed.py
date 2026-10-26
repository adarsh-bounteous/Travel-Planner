from collections.abc import Callable
from datetime import date, timedelta
from typing import Protocol
from uuid import uuid4

from app.trips.store import Trip, TripStore, reconcile_days

DEMO_EMAIL = "demo@example.com"
DEMO_PASSWORD = "demo-password-1"  # local use only; must satisfy app.auth.password.validate_password

DAYS_UNTIL_FIRST_TRIP = 30

# (name, destination, nights, days after the previous trip ends, budget, currency, traveller count)
_SAMPLE_TRIPS = (
    ("Weekend in Lisbon", "Lisbon", 3, 0, 900, "EUR", 2),
    ("Summer in Kyoto", "Kyoto", 10, 30, 3200, "USD", 1),
)


class SeedableIdentity(Protocol):
    def create_confirmed_user(self, email: str, password: str) -> str:
        """Create an already-confirmed account and return its user id."""

    def account_exists(self, email: str) -> bool: ...


def _sample_trips(today: date) -> list[Trip]:
    trips = []
    start = today + timedelta(days=DAYS_UNTIL_FIRST_TRIP)
    for name, destination, nights, gap, budget, currency, travellers in _SAMPLE_TRIPS:
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
    """Seed the demo user and sample trips only when local data is completely empty.

    Returns True when it seeded, False when it did nothing. Nothing is ever updated once
    seeded, so a restart keeps edits and never duplicates.
    """
    if not is_empty():
        return False
    user_id = identity.create_confirmed_user(DEMO_EMAIL, DEMO_PASSWORD)
    for trip in _sample_trips(today):
        trips.save_trip(user_id, trip)
    return True
