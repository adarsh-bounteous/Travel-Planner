import pytest
from datetime import date

from app.main import app
from app.routers.deps import get_visa_rules
from app.trips.visa import OFFICIAL_SITES, InMemoryVisaRules, VisaRule
from tests.trip_body import create_trip


def _d(cit, res):
    return {"citizenship": cit, "residence": res, "health_status": "Allergies"}


def _trip(owner, people, destination="Kyoto, Japan"):
    tid = create_trip(owner, destination=destination)
    ids = {}
    for name, details in people:
        t = owner.post(f"/trips/{tid}/travellers", json={"name": name}).json()["travellers"][-1]
        owner.put(f"/trips/{tid}/travellers/{t['id']}", json=details)
        ids[name] = t["id"]
    return tid, ids


def by_name(rows, name):
    return next(r for r in rows if r["name"] == name)


def _rows(client, tid):
    return client.get(f"/trips/{tid}/visa").json()["travellers"]


def test_one_traveller_sees_whether_a_visa_is_needed(sign_in_as):
    a = sign_in_as("a@example.com")
    a.put("/profile", json=_d("Ireland", "Ireland"))
    tid = create_trip(a, destination="Kyoto, Japan")
    assert a.get(f"/trips/{tid}").json()["options"] == []  # no bookings yet
    assert a.get(f"/trips/{tid}/visa").json()["travellers"][0]["status"] == "not_needed"


def test_each_traveller_sees_their_own_requirement(sign_in_as):
    a = sign_in_as("a@example.com")
    tid, _ = _trip(a, [("Ana", _d("Canada", "Canada")), ("Ben", _d("India", "Canada"))])
    rows = _rows(a, tid)
    ana, ben = by_name(rows, "Ana"), by_name(rows, "Ben")
    assert (ana["status"], ben["status"]) == ("not_needed", "required")
    assert (ben["citizenship"], ben["residence"]) == ("India", "Canada")
    assert ana["message"] == "No visa is needed for Japan."
    assert ben["message"] == "A visa is required for Japan."
    assert ana["confirm_note"] == ben["confirm_note"] == "Confirm with official sources."
    assert ana["official_site_url"] is None and ben["official_site_url"] is None


def test_no_data_has_official_link_no_confirm_note_and_no_advisory(sign_in_as):
    app.dependency_overrides[get_visa_rules] = lambda: InMemoryVisaRules({}, date(2026, 10, 20))
    a = sign_in_as("a@example.com")
    tid, _ = _trip(a, [("Ana", _d("Canada", "Canada"))], destination="Lisbon, Portugal")
    row = by_name(_rows(a, tid), "Ana")
    assert row["status"] == "no_data" and "advisory" not in row
    assert row["official_site_url"] == OFFICIAL_SITES["Portugal"]
    assert row["confirm_note"] is None


def test_self_check_marks_and_leaves_the_plan_unresolved(sign_in_as):
    app.dependency_overrides[get_visa_rules] = lambda: InMemoryVisaRules({}, date(2026, 10, 20))
    a = sign_in_as("a@example.com")
    tid, ids = _trip(a, [("Ben", _d("India", "Canada"))], destination="Lisbon, Portugal")
    r = a.put(f"/trips/{tid}/visa/{ids['Ben']}/self-check", json={"checked": True})
    ben = by_name(r.json()["travellers"], "Ben")
    assert ben["marked_self_check"] is True and ben["unresolved"] is True
    assert by_name(_rows(a, tid), "Ben")["marked_self_check"] is True
    assert a.get(f"/trips/{tid}").json()["unresolved_visas"] == ["Ben"]
    a.put(f"/trips/{tid}/visa/{ids['Ben']}/self-check", json={"checked": False})
    assert a.get(f"/trips/{tid}").json()["unresolved_visas"] == []


def test_self_check_is_refused_when_there_is_data_or_the_traveller_is_unknown(sign_in_as):
    a = sign_in_as("a@example.com")
    tid, ids = _trip(a, [("Ana", _d("Canada", "Canada"))])
    assert a.put(f"/trips/{tid}/visa/{ids['Ana']}/self-check", json={"checked": True}).status_code == 409
    assert a.put(f"/trips/{tid}/visa/nobody/self-check", json={"checked": True}).status_code == 404


def test_removing_a_traveller_drops_their_mark(sign_in_as):
    a = sign_in_as("a@example.com")
    tid, ids = _trip(a, [("Ben", _d("India", "Canada"))], destination="Lisbon, Portugal")
    a.put(f"/trips/{tid}/visa/{ids['Ben']}/self-check", json={"checked": True})
    a.delete(f"/trips/{tid}/travellers/{ids['Ben']}")
    assert a.get(f"/trips/{tid}").json()["unresolved_visas"] == []


def test_a_published_rule_clears_the_unresolved_state(sign_in_as):
    source = InMemoryVisaRules({}, date(2026, 10, 20))
    app.dependency_overrides[get_visa_rules] = lambda: source
    a = sign_in_as("a@example.com")
    tid, ids = _trip(a, [("Ben", _d("India", "Canada"))], destination="Lisbon, Portugal")
    a.put(f"/trips/{tid}/visa/{ids['Ben']}/self-check", json={"checked": True})
    source.publish({("Portugal", "India"): VisaRule(required=True)}, date(2026, 10, 27))
    assert a.get(f"/trips/{tid}").json()["unresolved_visas"] == []


def test_a_provider_change_shows_on_the_next_view(sign_in_as):
    source = InMemoryVisaRules({("Japan", "India"): VisaRule(required=True)}, date(2026, 10, 20))
    app.dependency_overrides[get_visa_rules] = lambda: source
    a = sign_in_as("a@example.com")
    tid, _ = _trip(a, [("Ben", _d("India", "Canada"))])
    assert by_name(_rows(a, tid), "Ben")["status"] == "required"
    source.publish({("Japan", "India"): VisaRule(required=False)}, date(2026, 10, 27))
    body = a.get(f"/trips/{tid}/visa").json()
    assert by_name(body["travellers"], "Ben")["status"] == "not_needed"
    assert body["published_on"] == "2026-10-27"


def test_visa_needs_the_owner(sign_in_as):
    a = sign_in_as("a@example.com")
    tid, _ = _trip(a, [])
    assert sign_in_as("s@example.com").get(f"/trips/{tid}/visa").status_code == 404


def test_old_stored_trips_without_self_checks_still_load(sign_in_as):
    from app.trips.store import Trip

    a = sign_in_as("a@example.com")
    tid, _ = _trip(a, [("Ben", _d("India", "Canada"))])
    (key,) = [k for k in sign_in_as.trips._trips if k[1] == tid]
    record = sign_in_as.trips._trips[key].model_dump(exclude={"visa_self_checks"})
    sign_in_as.trips._trips[key] = Trip.model_validate(record)
    assert a.get(f"/trips/{tid}").json()["unresolved_visas"] == []
    assert a.get(f"/trips/{tid}/visa").status_code == 200


def test_editors_do_not_see_the_owners_visa_marks(sign_in_as):
    a, ed = sign_in_as("a@example.com"), sign_in_as("ed@example.com")
    tid, ids = _trip(a, [("Ben", _d("India", "Canada"))], destination="Lisbon, Portugal")
    a.put(f"/trips/{tid}/visa/{ids['Ben']}/self-check", json={"checked": True})
    invite = a.post(f"/trips/{tid}/editors", json={"email": "ed@example.com"}).json()["editors"][0]
    ed.post(f"/invites/{invite['invite_url'].rsplit('/', 1)[1]}/accept")
    body = ed.get(f"/trips/{tid}").json()
    assert body["visa_self_checks"] == [] and body["unresolved_visas"] == []


@pytest.mark.parametrize(
    "dest,country",
    [
        ("Tokyo, Japan", "Japan"), ("Lisbon, Portugal", "Portugal"), ("Delhi, India", "India"),
        ("Bangkok, Thailand", "Thailand"), ("Oaxaca, Mexico", "Mexico"), ("Fez, Morocco", "Morocco"),
        ("Cusco, Peru", "Peru"),
    ],
)
def test_visa_guidance_names_the_selected_country(sign_in_as, dest, country):
    a = sign_in_as("a@example.com")
    tid, _ = _trip(a, [("Ana", _d("Canada", "Canada"))], destination=dest)
    row = by_name(_rows(a, tid), "Ana")
    assert row["status"] != "no_data"
    assert row["guidance"]["country"] == country
    assert country in row["message"]
