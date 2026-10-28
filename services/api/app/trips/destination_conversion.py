from app.trips.destination_match import best_match
from app.trips.store import Trip


def convert_trip(trip: Trip) -> Trip:
    """The trip unchanged when already converted; else stamped converted, with a country and place or flagged.

    A trip that already has a country and place keeps them. `updated_at` is never touched.
    """
    if trip.destination_converted:
        return trip
    changes: dict = {"destination_converted": True}
    if not (trip.country and trip.place) and (trip.destination or "").strip():
        match = best_match(trip.destination)
        if match:
            changes.update(country=match[0], place=match[1], destination_unmatched=False)
        else:
            changes["destination_unmatched"] = True
    return trip.model_copy(update=changes)
