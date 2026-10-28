from tests.trip_body import choose_destination, create_trip

URLS = ["visa", "sim-options", "medical-guidance", "recommendations", "restaurant-options", "activity-options"]
PLACE_URLS = ["recommendations", "restaurant-options", "activity-options"]


def _trip(client, country, place, **changes):
    tid = create_trip(client, destination="Lisbon", start_date="2027-03-12", end_date="2027-03-20", **changes)
    choose_destination(tid, country, place)
    return tid


def _body(client, tid, url):
    r = client.get(f"/trips/{tid}/{url}")
    assert r.status_code == 200
    return r.json()


def test_portugal_visa_sim_and_medical_are_for_portugal(sign_in_as):  # AC1, AC2, AC3
    a = sign_in_as("a@example.com")
    a.put("/profile", json={"citizenship": "Canada", "residence": "Canada", "health_status": "Allergies"})
    tid = _trip(a, "Portugal", "Lisbon")
    visa = _body(a, tid, "visa")
    assert visa["destination"]["country"] == "Portugal" and visa["status"] == "ready"
    assert visa["travellers"][0]["guidance"]["country"] == "Portugal"
    sim = _body(a, tid, "sim-options")
    assert sim["status"] == "ready" and sim["options"]
    assert all("Portugal" in o["countries"] for o in sim["options"])
    medical = _body(a, tid, "medical-guidance")
    assert medical["destination"]["country"] == "Portugal" and medical["status"] == "ready"


def test_the_chosen_place_drives_places_content(sign_in_as):  # AC4
    a = sign_in_as("a@example.com")
    tid = _trip(a, "Portugal", "Lisbon")
    assert _body(a, tid, "recommendations")["items"]
    assert _body(a, tid, "restaurant-options")["options"]
    assert _body(a, tid, "activity-options")["options"]


def test_every_view_shows_the_same_label(sign_in_as):  # AC5
    a = sign_in_as("a@example.com")
    tid = _trip(a, "Portugal", "Lisbon")
    assert {_body(a, tid, u)["destination"]["label"] for u in URLS} == {"Lisbon, Portugal"}


def test_no_chosen_destination_asks_to_choose(sign_in_as):  # AC6
    a = sign_in_as("a@example.com")
    tid = _trip(a, None, None)
    for url in URLS:
        body = _body(a, tid, url)
        assert body["destination"] is None and body["status"] == "no_destination", url


def test_unmatched_legacy_text_asks_to_choose(sign_in_as):  # AC6
    a = sign_in_as("a@example.com")
    tid = create_trip(a, destination="Paris, France")
    for url in URLS:
        assert _body(a, tid, url)["status"] == "no_destination", url


def test_country_without_data_says_so(sign_in_as):  # AC7
    a = sign_in_as("a@example.com")
    tid = _trip(a, "France", "Paris")
    for url in [u for u in URLS if u != "sim-options"]:  # the seeded SIMs do cover France
        assert _body(a, tid, url)["status"] == "no_country_data", url
    narnia = _trip(a, "Narnia", "Cair Paravel")
    assert _body(a, narnia, "sim-options")["status"] == "no_country_data"


def test_country_without_place_asks_for_a_place_on_place_views_only(sign_in_as):  # AC8
    a = sign_in_as("a@example.com")
    tid = _trip(a, "Portugal", None)
    for url in PLACE_URLS:
        assert _body(a, tid, url)["status"] == "no_destination", url
    for url in ["visa", "sim-options", "medical-guidance"]:
        assert _body(a, tid, url)["status"] == "ready", url


def test_place_without_data_says_so(sign_in_as):  # AC9
    a = sign_in_as("a@example.com")
    tid = _trip(a, "Portugal", "Lagos")
    for url in PLACE_URLS:
        assert _body(a, tid, url)["status"] == "no_place_data", url


def test_a_filter_that_empties_the_list_is_not_no_information(sign_in_as):  # AC9
    a = sign_in_as("a@example.com")
    tid = _trip(a, "Portugal", "Lisbon", interests=["Nightlife"])
    body = _body(a, tid, "recommendations")
    assert body["status"] == "ready" and body["items"] == []


def test_a_different_place_gets_its_own_items(sign_in_as):  # AC4
    a = sign_in_as("a@example.com")
    lisbon = _body(a, _trip(a, "Portugal", "Lisbon"), "recommendations")
    porto = _body(a, _trip(a, "Portugal", "Porto"), "restaurant-options")
    assert lisbon["items"] and {o["city"] for o in porto["options"]} == {"Porto"}
