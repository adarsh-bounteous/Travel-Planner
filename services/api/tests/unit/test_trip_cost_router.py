from datetime import date
from decimal import Decimal

from app.trips.store import ChosenOption, Editor
from tests.trip_body import trip_body


def _save(make, owner_email: str, editor_email: str) -> str:
    owner = make(owner_email)
    trip_id = owner.post("/trips", json=trip_body(budget=150)).json()["id"]
    owner_id = next(iter(make.trips._trips))[0]
    options = [
        ChosenOption(id="o1", title="Hotel", category="Stays", date=date(2027, 3, 3), price=Decimal(120), currency="EUR"),
        ChosenOption(id="o2", title="Train", category="Conveyance", date=date(2027, 3, 3), price=Decimal(80), currency="EUR"),
    ]
    editor = Editor(email=editor_email, token="fake-token", accepted=True)
    saved = make.trips.get_trip(owner_id, trip_id)
    make.trips.save_trip(owner_id, saved.model_copy(update={"options": options, "editors": [editor]}))
    make.trips.link_editor(editor_email, owner_id, trip_id)
    return trip_id


def test_owner_sees_cost_summary(sign_in_as):
    trip_id = _save(sign_in_as, "owner@example.com", "editor@example.com")
    body = sign_in_as("owner@example.com").get(f"/trips/{trip_id}").json()
    assert body["cost"]["total"] == 200
    assert body["cost"]["over_budget_by"] == 50


def test_accepted_editor_sees_the_same_cost(sign_in_as):
    trip_id = _save(sign_in_as, "owner@example.com", "editor@example.com")
    body = sign_in_as("editor@example.com").get(f"/trips/{trip_id}").json()
    assert body["cost"]["total"] == 200


def test_stranger_still_gets_404(sign_in_as):
    trip_id = _save(sign_in_as, "owner@example.com", "editor@example.com")
    assert sign_in_as("stranger@example.com").get(f"/trips/{trip_id}").status_code == 404
