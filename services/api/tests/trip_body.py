def trip_body(**changes) -> dict:
    """A valid POST /trips body (every New trip set-up basic); `changes` override single fields."""
    return {
        "name": "Lisbon",
        "destination": "Lisbon",
        "start_date": "2027-03-12",
        "end_date": "2027-03-15",
        "budget": 1800,
        "currency": "EUR",
        "traveller_count": 2,
        **changes,
    }


def choose_destination(trip_id: str, country: str | None, place: str | None) -> None:
    """Store the chosen country and place on a trip made through the API (POST /trips cannot set them)."""
    from app.main import app
    from app.routers import deps

    store = app.dependency_overrides.get(deps.get_trips, deps.get_trips)()
    for (owner, id_), trip in list(store._trips.items()):
        if id_ == trip_id:
            store.save_trip(owner, trip.model_copy(update={"country": country, "place": place}))


def create_trip(client, **changes) -> str:
    """POST /trips, then choose the country and place the destination text names (none when it names no place)."""
    from app.trips.destination_match import best_match

    body = trip_body(**changes)
    trip_id = client.post("/trips", json=body).json()["id"]
    choose_destination(trip_id, *(best_match(body["destination"]) or (None, None)))
    return trip_id
