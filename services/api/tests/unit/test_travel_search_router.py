import pytest

from app.routers import deps

KINDS = ["stay", "flight", "transport"]


@pytest.fixture
def on(monkeypatch):
    monkeypatch.setenv("APP_ENV", "local")
    monkeypatch.setenv("LOCAL_MODE", "on")


@pytest.fixture
def off(monkeypatch):
    monkeypatch.delenv("LOCAL_MODE", raising=False)


def params(kind, **over):
    return {
        "type": kind,
        "destination": "Lisbon",
        "depart": "2027-03-12",
        "return": "2027-03-15",
        "route": "Porto - Lisbon",
        **over,
    }


def test_search_needs_sign_in(on):
    from fastapi.testclient import TestClient

    from app.main import app

    assert TestClient(app).get("/travel-search", params=params("stay")).status_code == 401


@pytest.mark.parametrize("kind", KINDS)
def test_local_search_lists_options(on, sign_in_as, kind):
    body = sign_in_as("a@example.com").get("/travel-search", params=params(kind)).json()
    assert body["source"] == "local" and body["matched"] is True
    assert len(body["options"]) >= 3
    assert all(o["url"].startswith("local://booking/") for o in body["options"])


@pytest.mark.parametrize("kind", KINDS)
def test_other_destination_gives_other_options(on, sign_in_as, kind):
    client = sign_in_as("a@example.com")
    a = client.get("/travel-search", params=params(kind)).json()
    b = client.get("/travel-search", params=params(kind, destination="Paris")).json()
    assert [o["id"] for o in a["options"]] != [o["id"] for o in b["options"]]


@pytest.mark.parametrize("kind", KINDS)
def test_unknown_place_is_200_with_nothing(on, sign_in_as, kind):
    r = sign_in_as("a@example.com").get("/travel-search", params=params(kind, destination="Nowhere Land"))
    assert r.status_code == 200
    assert r.json()["options"] == [] and r.json()["matched"] is False


@pytest.mark.parametrize("kind", KINDS)
def test_return_before_depart_is_422_with_no_options(on, sign_in_as, kind):
    r = sign_in_as("a@example.com").get(
        "/travel-search", params=params(kind, depart="2027-03-15", **{"return": "2027-03-12"})
    )
    assert r.status_code == 422 and r.json() == {"code": "return_before_depart"}


def test_off_uses_the_real_providers(off, sign_in_as):
    client = sign_in_as("a@example.com")
    stay = client.get("/travel-search", params=params("stay")).json()
    assert stay["source"] == "provider"
    assert any("Hotel Alfama Terrace" in o["name"] for o in stay["options"])
    flight = client.get("/travel-search", params=params("flight", destination="Faro", route="Lisbon - Faro")).json()
    assert flight["source"] == "provider" and flight["options"]
    transport = client.get("/travel-search", params=params("transport")).json()
    assert transport["source"] == "provider" and transport["options"]
    assert deps.get_stay_providers() is deps._stay_providers()
    assert deps.get_flight_providers() is deps._flight_providers()
    assert deps.get_transport_providers() is deps._transport_providers()


def test_booking_returns_the_listed_option(on, sign_in_as):
    client = sign_in_as("a@example.com")
    options = client.get("/travel-search", params=params("stay")).json()["options"]
    r = client.get("/travel-search/booking", params={"ref": options[0]["url"]})
    assert r.status_code == 200
    assert r.json()["option"] == options[0]


def test_booking_unknown_ref_is_404(on, sign_in_as):
    client = sign_in_as("a@example.com")
    assert client.get("/travel-search/booking", params={"ref": "https://example.com/x"}).status_code == 404


def test_booking_is_404_with_local_mode_off(off, sign_in_as):
    r = sign_in_as("a@example.com").get(
        "/travel-search/booking", params={"ref": "local://booking/stay-lisbon-1?start=2027-03-12&end=2027-03-15"}
    )
    assert r.status_code == 404
