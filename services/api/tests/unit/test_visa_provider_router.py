from datetime import date

from app.main import app
from app.routers.deps import get_visa_rules
from app.trips.visa import OFFICIAL_SITES, InMemoryVisaRules
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


def _providers(client, tid, key):
    return client.get(f"/trips/{tid}/visa/{key}/providers")


def test_required_traveller_gets_three_providers_from_both_sources(sign_in_as):
    a = sign_in_as("a@example.com")
    tid, ids = _trip(a, [("Ben", _d("India", "Canada"))])
    body = _providers(a, tid, ids["Ben"]).json()
    assert body["outcome"] == "shortlist" and len(body["providers"]) == 3 and body["matching_count"] == 5
    assert {p["source"] for p in body["providers"]} == {"web_search", "partner"}
    assert all(p["url"].startswith("https://") for p in body["providers"])


def test_marked_self_check_still_gets_the_shortlist(sign_in_as):
    a = sign_in_as("a@example.com")
    tid, ids = _trip(a, [("Ben", _d("India", "Canada"))])
    assert a.put(f"/trips/{tid}/visa/{ids['Ben']}/self-check", json={"checked": True}).status_code == 200
    body = _providers(a, tid, ids["Ben"]).json()
    assert body["outcome"] == "shortlist" and len(body["providers"]) == 3


def test_no_visa_needed_has_no_shortlist(sign_in_as):
    a = sign_in_as("a@example.com")
    tid, ids = _trip(a, [("Ana", _d("Canada", "Canada"))])
    body = _providers(a, tid, ids["Ana"]).json()
    assert body["outcome"] == "no_visa_needed" and body["providers"] == []


def test_no_visa_data_gives_the_message_and_official_site(sign_in_as):
    app.dependency_overrides[get_visa_rules] = lambda: InMemoryVisaRules({}, date(2026, 10, 20))
    a = sign_in_as("a@example.com")
    tid, ids = _trip(a, [("Ana", _d("Canada", "Canada"))], destination="Lisbon, Portugal")
    body = _providers(a, tid, ids["Ana"]).json()
    assert body["outcome"] == "no_data" and body["providers"] == []
    assert body["official_site_url"] == OFFICIAL_SITES["Portugal"] and body["message"]


def test_no_matching_provider_gives_the_no_data_outcome(sign_in_as):
    a = sign_in_as("a@example.com")
    tid, ids = _trip(a, [("Ben", _d("India", "Canada"))], destination="Cusco, Peru")  # seeded Peru service is for Canadians
    body = _providers(a, tid, ids["Ben"]).json()
    assert body["outcome"] == "no_data" and body["matching_count"] == 0
    assert body["official_site_url"].startswith("https://")


def test_owner_only_and_unknown_traveller(sign_in_as):
    a = sign_in_as("a@example.com")
    tid, ids = _trip(a, [("Ben", _d("India", "Canada"))])
    assert sign_in_as("s@example.com").get(f"/trips/{tid}/visa/{ids['Ben']}/providers").status_code == 404
    assert _providers(a, tid, "nobody").status_code == 404
