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
