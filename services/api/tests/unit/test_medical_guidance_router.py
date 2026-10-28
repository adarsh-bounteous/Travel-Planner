from tests.trip_body import create_trip


def _trip(owner):
    tid = create_trip(owner, destination="Lisbon, Portugal")
    for name, cit in (("Ana", "Canada"), ("Ben", "India")):
        t = owner.post(f"/trips/{tid}/travellers", json={"name": name}).json()["travellers"][-1]
        owner.put(
            f"/trips/{tid}/travellers/{t['id']}",
            json={"citizenship": cit, "residence": cit, "health_status": "Allergies"},
        )
    return tid


def test_each_traveller_has_guidance_under_their_own_name(sign_in_as):
    a = sign_in_as("a@example.com")
    rows = a.get(f"/trips/{_trip(a)}/medical-guidance").json()["travellers"]
    assert [r["name"] for r in rows] == ["You", "Ana", "Ben"]
    assert rows[1]["tests"] != rows[2]["tests"]
    assert all(r["confirm_note"] == "Confirm with official sources before you travel." for r in rows)
    assert rows[0]["result"] == "no_data" and rows[0]["official_site_url"]


def test_another_user_gets_not_found(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    b = sign_in_as("b@example.com")
    assert b.get(f"/trips/{tid}/medical-guidance").status_code == 404


def test_unauthenticated_call_is_refused(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    a.cookies.clear()
    assert a.get(f"/trips/{tid}/medical-guidance").status_code == 401
