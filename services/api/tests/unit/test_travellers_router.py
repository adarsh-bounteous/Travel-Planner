from tests.trip_body import trip_body


def _trip(owner):
    return owner.post("/trips", json=trip_body()).json()["id"]


def test_owner_adds_a_traveller_without_an_account(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    r = a.post(f"/trips/{tid}/travellers", json={"name": "Ana"})
    assert r.status_code == 201
    assert [t["name"] for t in r.json()["travellers"]] == ["Ana"]


def test_travellers_are_listed_in_the_order_added(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    for n in ("Ana", "Ben"):
        a.post(f"/trips/{tid}/travellers", json={"name": n})
    assert [t["name"] for t in a.get(f"/trips/{tid}").json()["travellers"]] == ["Ana", "Ben"]


def test_blank_traveller_names_are_refused_and_list_unchanged(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    a.post(f"/trips/{tid}/travellers", json={"name": "Ana"})
    before = a.get(f"/trips/{tid}").json()["travellers"]
    for name in ("", "   "):
        assert a.post(f"/trips/{tid}/travellers", json={"name": name}).status_code == 422
    assert a.get(f"/trips/{tid}").json()["travellers"] == before
