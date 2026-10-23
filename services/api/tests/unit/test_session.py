from datetime import UTC, datetime, timedelta

from app.auth.session import issue_session, read_session

T0 = datetime(2026, 1, 1, tzinfo=UTC)


def test_session_valid_at_six_days():
    token = issue_session("u1", T0)
    assert read_session(token, T0 + timedelta(days=6)) == "u1"


def test_session_expires_at_exactly_seven_days():
    token = issue_session("u1", T0)
    assert read_session(token, T0 + timedelta(days=7)) is None


def test_reissued_session_slides_the_window():
    reissued = issue_session("u1", T0 + timedelta(days=6))
    assert read_session(reissued, T0 + timedelta(days=12)) == "u1"


def test_tampered_token_is_rejected():
    token = issue_session("u1", T0)
    payload, sig = token.rsplit(".", 1)
    assert read_session(f"{payload}.{'0' * len(sig)}", T0) is None
    assert read_session("garbage", T0) is None
    assert read_session("", T0) is None


def test_token_signed_with_other_secret_is_rejected(monkeypatch):
    token = issue_session("u1", T0)
    monkeypatch.setenv("SESSION_SECRET", "another-test-secret")
    assert read_session(token, T0) is None
