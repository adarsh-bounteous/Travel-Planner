from tests.trip_body import create_trip, trip_body

URL = "https://roamly.example/roamly-europe-10"


def _trip(client, **changes):
    return create_trip(client, destination="Lisbon, Portugal", start_date="2027-03-12", end_date="2027-03-20", **changes)


def test_shortlist_lists_both_sources_with_prices_per_traveller(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    out = a.get(f"/trips/{tid}/sim-options").json()
    assert {o["source"] for o in out["options"]} == {"web_search", "partner"}
    assert out["preference"] is None and out["picked"] is None
    assert out["travellers"] == ["You", "Traveller 2"]
    assert [t["label"] for t in out["options"][0]["traveller_prices"]] == ["You", "Traveller 2"]


def test_preference_comes_from_the_profile(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    a.put("/profile", json={"sim_preference": "physical"})
    out = a.get(f"/trips/{tid}/sim-options").json()
    assert out["preference"] == "physical" and out["options"][0]["sim_type"] == "physical"


def test_profile_put_without_the_key_keeps_the_preference(sign_in_as):
    a = sign_in_as("a@example.com")
    a.put("/profile", json={"sim_preference": "esim"})
    a.put("/profile", json={"display_name": "Ana"})
    assert a.get("/profile").json()["sim_preference"] == "esim"
    a.put("/profile", json={"sim_preference": None})
    assert a.get("/profile").json()["sim_preference"] is None


def test_pick_stores_the_server_side_price_and_url_and_adds_to_total(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    before = a.get(f"/trips/{tid}").json()["cost"]["total"]
    r = a.put(f"/trips/{tid}/sim", json={"option_id": "roamly-europe-10", "url": "https://evil.example", "price": "1"})
    assert r.status_code == 200
    sim = r.json()["sim"]
    assert sim["url"] == URL and sim["price"] == "14.50"
    assert r.json()["cost"]["total"] == before + 29.0
    assert a.get(f"/trips/{tid}").json()["sim"]["option_id"] == "roamly-europe-10"


def test_pick_outside_the_shortlist_is_invalid(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    for bad in ("nope", "atlas-asia-10", "roamly-europe-3"):
        r = a.put(f"/trips/{tid}/sim", json={"option_id": bad})
        assert r.status_code == 422 and r.json()["code"] == "invalid_sim"


def test_delete_clears_the_pick_and_the_total(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    a.put(f"/trips/{tid}/sim", json={"option_id": "roamly-europe-10"})
    r = a.delete(f"/trips/{tid}/sim")
    assert r.json()["sim"] is None and r.json()["cost"]["total"] == 0


def test_pick_stays_but_flags_when_dates_change(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _dated(a, "2027-03-02", "2027-03-09")
    a.put(f"/trips/{tid}/sim", json={"option_id": "roamly-europe-3"})
    moved = trip_body(destination="Lisbon, Portugal", start_date="2027-04-02", end_date="2027-04-09")
    assert a.put(f"/trips/{tid}", json=moved).status_code == 200
    out = a.get(f"/trips/{tid}/sim-options").json()
    assert out["options"] != []
    assert out["picked"]["option_id"] == "roamly-europe-3" and out["picked"]["covers_dates"] is False
    assert a.get(f"/trips/{tid}").json()["sim"]["option_id"] == "roamly-europe-3"


def _dated(client, start, end, destination="Lisbon, Portugal"):
    return create_trip(client, destination=destination, start_date=start, end_date=end)


def test_april_2027_trip_shows_sim_options(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _dated(a, "2027-04-02", "2027-04-09")
    assert a.get(f"/trips/{tid}/sim-options").json()["options"] != []


def test_march_2028_trip_shows_sim_options(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _dated(a, "2028-03-12", "2028-03-20")
    assert a.get(f"/trips/{tid}/sim-options").json()["options"] != []


def test_march_2027_trip_shows_sim_options(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _dated(a, "2027-03-12", "2027-03-20")
    assert a.get(f"/trips/{tid}/sim-options").json()["options"] != []


def test_april_shortlist_matches_march_shortlist(sign_in_as):
    a = sign_in_as("a@example.com")

    def ids(s, e):
        return [o["id"] for o in a.get(f"/trips/{_dated(a, s, e)}/sim-options").json()["options"]]

    assert ids("2027-04-02", "2027-04-09") == ids("2027-03-12", "2027-03-20") != []


def test_trip_spanning_march_and_april_shows_sim_options(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _dated(a, "2027-03-28", "2027-04-04")
    assert a.get(f"/trips/{tid}/sim-options").json()["options"] != []


def test_no_match_gives_no_options_and_no_pick(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = a.post("/trips", json=trip_body(destination="Atlantis, Narnia")).json()["id"]
    out = a.get(f"/trips/{tid}/sim-options").json()
    assert out["options"] == [] and out["picked"] is None


def test_strangers_get_404_on_every_route(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    b = sign_in_as("b@example.com")
    assert b.get(f"/trips/{tid}/sim-options").status_code == 404
    assert b.put(f"/trips/{tid}/sim", json={"option_id": "roamly-europe-10"}).status_code == 404
    assert b.delete(f"/trips/{tid}/sim").status_code == 404
