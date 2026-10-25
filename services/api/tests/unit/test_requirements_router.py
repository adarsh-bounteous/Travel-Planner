from app.trips.requirements import medical_for, visa_for
from tests.trip_body import trip_body


def _trip_with(owner, people, destination="Kyoto, Japan"):
    tid = owner.post("/trips", json=trip_body(destination=destination)).json()["id"]
    for name, details in people:
        t = owner.post(f"/trips/{tid}/travellers", json={"name": name}).json()["travellers"][-1]
        if details:
            owner.put(f"/trips/{tid}/travellers/{t['id']}", json=details)
    return tid


def _d(cit, res, health="Allergies"):
    return {"citizenship": cit, "residence": res, "health_status": health}


def test_visa_is_based_on_each_travellers_citizenship_and_residence(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip_with(a, [("Ana", _d("Canada", "Canada")), ("Ben", _d("India", "Canada"))])
    rows = a.get(f"/trips/{tid}/requirements").json()
    ana = next(r for r in rows if r["name"] == "Ana")
    ben = next(r for r in rows if r["name"] == "Ben")
    assert "No visa needed" in ana["visa"]
    assert "Tourist visa needed" in ben["visa"]
    assert "Canada residence permit" in ben["visa"]


def test_medical_is_based_on_health_status(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip_with(a, [("Ana", _d("Canada", "Canada"))])
    ana = next(r for r in a.get(f"/trips/{tid}/requirements").json() if r["name"] == "Ana")
    assert ana["medical"] == medical_for("Allergies")
    assert "allergy card" in ana["medical"]


def test_a_traveller_with_no_details_has_no_requirements(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip_with(a, [("Ana", None)])
    ana = next(r for r in a.get(f"/trips/{tid}/requirements").json() if r["name"] == "Ana")
    assert (ana["visa"], ana["medical"]) == (None, None)


def test_owner_row_comes_from_the_profile(sign_in_as):
    a = sign_in_as("a@example.com")
    a.put("/profile", json={"citizenship": "Ireland", "residence": "Ireland", "health_status": "Allergies"})
    tid = _trip_with(a, [])
    rows = a.get(f"/trips/{tid}/requirements").json()
    assert rows[0]["traveller_id"] is None
    assert "No visa needed" in rows[0]["visa"]


def test_requirements_need_a_signed_in_owner(sign_in_as):
    from fastapi.testclient import TestClient

    from app.main import app

    a = sign_in_as("a@example.com")
    tid = _trip_with(a, [])
    assert TestClient(app).get(f"/trips/{tid}/requirements").status_code == 401
    assert sign_in_as("s@example.com").get(f"/trips/{tid}/requirements").status_code == 404


def test_pure_rules():
    assert visa_for("Kyoto, Japan", "", "Canada") is None
    assert visa_for("Kyoto, Japan", "Canada", "") is None
    assert "Tourist visa" in visa_for("Kyoto, Japan", "India", "India")
    assert "don't have visa advice" in visa_for("Lisbon", "India", "India")
    assert medical_for("") is None
    assert medical_for("No health needs to share") == medical_for("None reported")


def test_chronic_condition_advice_does_not_name_a_country():
    assert "Japan" not in medical_for("Chronic condition")
