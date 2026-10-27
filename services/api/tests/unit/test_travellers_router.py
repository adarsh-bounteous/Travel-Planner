import pytest

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


OK = {"citizenship": "Canada", "residence": "Canada", "health_status": "Allergies"}


def _with_ana(owner):
    tid = _trip(owner)
    r = owner.post(f"/trips/{tid}/travellers", json={"name": "Ana"})
    return tid, f"/trips/{tid}/travellers/{r.json()['travellers'][0]['id']}"


def test_a_new_traveller_has_blank_details_and_no_tastes_diet_or_religion(sign_in_as):
    a = sign_in_as("a@example.com")
    tid, _ = _with_ana(a)
    t = a.get(f"/trips/{tid}").json()["travellers"][0]
    assert set(t) == {"id", "name", "age", "citizenship", "residence", "health_status", "vaccinations_had", "pregnant"}
    assert t["citizenship"] == ""


def test_owner_saves_all_three_details(sign_in_as):
    a = sign_in_as("a@example.com")
    tid, url = _with_ana(a)
    r = a.put(url, json=OK)
    assert r.status_code == 200
    assert r.json()["travellers"][0]["citizenship"] == "Canada"


@pytest.mark.parametrize("blank", ["citizenship", "residence", "health_status"])
def test_a_blank_detail_is_refused_and_stored_values_unchanged(sign_in_as, blank):
    a = sign_in_as("a@example.com")
    tid, url = _with_ana(a)
    a.put(url, json=OK)
    assert a.put(url, json={**OK, blank: "  "}).status_code == 422
    assert a.get(f"/trips/{tid}").json()["travellers"][0][blank] == OK[blank]


def test_changing_one_detail_shows_the_new_value(sign_in_as):
    a = sign_in_as("a@example.com")
    tid, url = _with_ana(a)
    a.put(url, json=OK)
    a.put(url, json={**OK, "residence": "Portugal"})
    t = a.get(f"/trips/{tid}").json()["travellers"][0]
    assert (t["citizenship"], t["residence"]) == ("Canada", "Portugal")


def test_unknown_traveller_is_not_found(sign_in_as):
    a = sign_in_as("a@example.com")
    tid, _ = _with_ana(a)
    assert a.put(f"/trips/{tid}/travellers/nope", json=OK).status_code == 404


def test_removing_a_traveller_drops_them_and_their_details(sign_in_as):
    a = sign_in_as("a@example.com")
    tid, url = _with_ana(a)
    a.put(url, json=OK)
    assert a.delete(url).status_code == 200
    assert a.get(f"/trips/{tid}").json()["travellers"] == []
    assert a.delete(url).status_code == 404


def test_saving_details_leaves_the_profile_untouched(sign_in_as):
    a = sign_in_as("a@example.com")
    before = a.get("/profile").json()
    _, url = _with_ana(a)
    a.put(url, json=OK)
    assert a.get("/profile").json() == before


def test_editors_and_strangers_never_get_companion_details(sign_in_as):
    owner, editor, stranger = (sign_in_as(e) for e in ("o@example.com", "e@example.com", "s@example.com"))
    tid, url = _with_ana(owner)
    owner.put(url, json=OK)
    invite = owner.post(f"/trips/{tid}/editors", json={"email": "e@example.com"}).json()["editors"][0]
    editor.post(f"/invites/{invite['invite_url'].rsplit('/', 1)[1]}/accept")
    view = editor.get(f"/trips/{tid}").json()
    assert all(
        t["citizenship"] == "" and t["residence"] == "" and t["health_status"] == ""
        for t in view["travellers"]
    )
    assert editor.put(url, json=OK).status_code == 403
    assert editor.delete(url).status_code == 403
    assert editor.get(f"/trips/{tid}/requirements").status_code == 403
    assert stranger.put(url, json=OK).status_code == 404


def test_share_link_payload_has_no_travellers(sign_in_as):
    from fastapi.testclient import TestClient

    from app.main import app

    a = sign_in_as("a@example.com")
    tid, url = _with_ana(a)
    a.put(url, json=OK)
    share = a.post(f"/trips/{tid}/share-link").json()["share_url"]
    body = TestClient(app).get(share.replace("/trips/read-only/", "/shared/")).json()
    assert "travellers" not in body


def test_a_traveller_stored_without_detail_keys_loads_as_blank():
    from app.trips.store import Trip

    stored = Trip.model_validate({"id": "x", "name": "Old", "travellers": [{"id": "a", "name": "Ana"}]})
    assert stored.travellers[0].citizenship == ""


@pytest.mark.parametrize("field", ["citizenship", "residence", "health_status"])
def test_a_value_outside_the_option_lists_is_refused(sign_in_as, field):
    a = sign_in_as("a@example.com")
    tid, url = _with_ana(a)
    assert a.put(url, json={**OK, field: "Atlantis"}).status_code == 422
    assert a.get(f"/trips/{tid}").json()["travellers"][0][field] == ""
