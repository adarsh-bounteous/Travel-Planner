import pytest

from tests.trip_body import trip_body


def _invite(owner, tid, email):
    r = owner.post(f"/trips/{tid}/editors", json={"email": email})
    assert r.status_code == 201
    editor = next(e for e in r.json()["editors"] if e["email"] == email)
    return editor["invite_url"].rsplit("/", 1)[1]


def _trip_with_day(owner):
    body = trip_body(start_date="2027-03-04", end_date="2027-03-05")
    return owner.post("/trips", json=body).json()["id"]


@pytest.fixture
def shared(sign_in_as):
    owner, ana, ben = (sign_in_as(e) for e in ("o@example.com", "ana@example.com", "ben@example.com"))
    tid = _trip_with_day(owner)
    for client, email in ((ana, "ana@example.com"), (ben, "ben@example.com")):
        assert client.post(f"/invites/{_invite(owner, tid, email)}/accept").status_code == 200
    return owner, ana, ben, tid


def test_invited_editor_opens_the_trip_with_editor_access(sign_in_as):
    owner, ana = sign_in_as("o@example.com"), sign_in_as("ana@example.com")
    tid = _trip_with_day(owner)
    token = _invite(owner, tid, "ana@example.com")
    assert ana.post(f"/invites/{token}/accept").json() == {"trip_id": tid}
    body = ana.get(f"/trips/{tid}").json()
    assert (body["is_owner"], body["can_edit"]) == (False, True)
    assert tid in [t["id"] for t in ana.get("/trips").json()]


def test_invite_is_sent_to_the_invitee(sign_in_as):
    owner = sign_in_as("o@example.com")
    tid = _trip_with_day(owner)
    token = _invite(owner, tid, "ana@example.com")
    sent = sign_in_as.invites.sent
    assert sent[-1][0] == "ana@example.com" and sent[-1][2].endswith(f"/invite/{token}")


def test_revoked_editor_no_longer_sees_the_trip_and_ben_still_does(shared):
    owner, ana, ben, tid = shared
    assert owner.delete(f"/trips/{tid}/editors/ana@example.com").status_code == 200
    assert ana.get(f"/trips/{tid}").status_code == 404
    assert tid not in [t["id"] for t in ana.get("/trips").json()]
    assert ben.get(f"/trips/{tid}").status_code == 200
    assert tid in [t["id"] for t in ben.get("/trips").json()]


def test_editor_adds_moves_and_removes_activities(shared):
    _, ana, _, tid = shared
    r = ana.post(f"/trips/{tid}/activities", json={"name": "Cooking class", "date": "2027-03-04"})
    assert r.status_code == 201
    aid = r.json()["activities"][0]["id"]
    r = ana.put(f"/trips/{tid}/activities/{aid}", json={"date": "2027-03-05"})
    assert [a["date"] for a in r.json()["activities"] if a["id"] == aid] == ["2027-03-05"]
    r = ana.delete(f"/trips/{tid}/activities/{aid}")
    assert r.status_code == 200 and r.json()["activities"] == []


def test_editor_cannot_manage_access_or_travellers_or_trip(shared):
    owner, ana, _, tid = shared
    assert ana.post(f"/trips/{tid}/editors", json={"email": "x@example.com"}).status_code == 403
    assert ana.delete(f"/trips/{tid}/editors/ben@example.com").status_code == 403
    assert ana.post(f"/trips/{tid}/travellers", json={"name": "Zed"}).status_code == 403
    assert ana.put(f"/trips/{tid}", json={"name": "Hacked"}).status_code == 403
    assert ana.put(f"/trips/{tid}/days/2027-03-04", json={"name": "X"}).status_code == 403
    assert ana.delete(f"/trips/{tid}").status_code == 403
    assert ana.get(f"/trips/{tid}").json()["editors"] == []
    assert len(owner.get(f"/trips/{tid}").json()["editors"]) == 2


def test_revoked_editor_changes_are_not_saved(shared):
    owner, ana, _, tid = shared
    aid = owner.post(f"/trips/{tid}/activities", json={"name": "Tile", "date": "2027-03-04"}).json()[
        "activities"
    ][0]["id"]
    owner.delete(f"/trips/{tid}/editors/ana@example.com")
    assert ana.post(f"/trips/{tid}/activities", json={"name": "Late", "date": "2027-03-04"}).status_code == 404
    assert ana.put(f"/trips/{tid}/activities/{aid}", json={"date": "2027-03-05"}).status_code == 404
    assert ana.delete(f"/trips/{tid}/activities/{aid}").status_code == 404
    acts = owner.get(f"/trips/{tid}").json()["activities"]
    assert [(a["name"], a["date"]) for a in acts] == [("Tile", "2027-03-04")]


def test_signed_out_reads_invite_but_cannot_accept(sign_in_as, shared):
    from fastapi.testclient import TestClient

    from app.main import app

    owner, _, _, tid = shared
    token = _invite(owner, tid, "cy@example.com")
    out = TestClient(app)
    assert out.get(f"/invites/{token}").json() == {"email": "cy@example.com", "trip_name": "Lisbon"}
    assert out.post(f"/invites/{token}/accept").status_code == 401
    assert out.get("/invites/nope").status_code == 404


def test_different_account_is_refused_and_granted_nothing(sign_in_as):
    owner, ben = sign_in_as("o@example.com"), sign_in_as("ben@example.com")
    tid = _trip_with_day(owner)
    token = _invite(owner, tid, "ana@example.com")
    r = ben.post(f"/invites/{token}/accept")
    assert (r.status_code, r.json()["code"]) == (403, "wrong_account")
    assert ben.get(f"/trips/{tid}").status_code == 404


def test_pending_invite_grants_nothing_and_revoked_token_is_gone(sign_in_as):
    owner, ana = sign_in_as("o@example.com"), sign_in_as("ana@example.com")
    tid = _trip_with_day(owner)
    token = _invite(owner, tid, "ana@example.com")
    assert ana.get(f"/trips/{tid}").status_code == 404
    owner.delete(f"/trips/{tid}/editors/ana@example.com")
    assert ana.get(f"/invites/{token}").status_code == 404
    assert ana.post(f"/invites/{token}/accept").status_code == 404


def test_invite_validation(sign_in_as):
    owner = sign_in_as("o@example.com")
    tid = _trip_with_day(owner)
    assert owner.post(f"/trips/{tid}/editors", json={"email": "nope"}).json()["code"] == "invalid_email"
    _invite(owner, tid, "ana@example.com")
    r = owner.post(f"/trips/{tid}/editors", json={"email": "ANA@example.com"})
    assert (r.status_code, r.json()["code"]) == (409, "already_editor")


def test_stranger_still_gets_404_everywhere(sign_in_as):
    owner, eve = sign_in_as("o@example.com"), sign_in_as("eve@example.com")
    tid = _trip_with_day(owner)
    assert eve.get(f"/trips/{tid}").status_code == 404
    assert eve.post(f"/trips/{tid}/travellers", json={"name": "Z"}).status_code == 404
    assert eve.post(f"/trips/{tid}/editors", json={"email": "z@example.com"}).status_code == 404
    assert eve.post(f"/trips/{tid}/activities", json={"name": "Z", "date": "2027-03-04"}).status_code == 404


def test_invite_is_kept_when_the_email_cannot_be_sent(sign_in_as):
    from app.main import app
    from app.routers import deps

    class Failing:
        def send(self, email, trip_name, link):
            raise RuntimeError("ses down")

    owner = sign_in_as("o@example.com")
    tid = _trip_with_day(owner)
    app.dependency_overrides[deps.get_invite_sender] = lambda: Failing()
    r = owner.post(f"/trips/{tid}/editors", json={"email": "ana@example.com"})
    assert r.status_code == 201
    assert r.json()["editors"][0]["invite_url"].startswith("/invite/")


def test_list_marks_shared_trips_and_hides_owner_only_fields(sign_in_as):  # AC1, AC7, AC8
    owner, ana = sign_in_as("o@example.com"), sign_in_as("ana@example.com")
    shared_id = _trip_with_day(owner)
    ana.post("/trips", json=trip_body(name="Mine"))
    assert ana.post(f"/invites/{_invite(owner, shared_id, 'ana@example.com')}/accept").status_code == 200
    listed = {t["name"]: t for t in ana.get("/trips").json()}
    assert set(listed) == {"Mine", "Lisbon"}
    assert listed["Mine"]["shared"] is False
    assert listed["Lisbon"]["shared"] is True
    assert listed["Lisbon"]["editors"] == [] and listed["Lisbon"]["share_token"] is None


def test_revoked_trip_drops_from_list_without_error(shared):  # AC14
    owner, ana, _ben, tid = shared
    owner.delete(f"/trips/{tid}/editors/ana@example.com")
    response = ana.get("/trips")
    assert response.status_code == 200
    assert tid not in [t["id"] for t in response.json()]
