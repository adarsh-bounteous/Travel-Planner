import pytest


@pytest.fixture(autouse=True)
def _session_secret(monkeypatch):
    monkeypatch.setenv("SESSION_SECRET", "test-session-secret")
