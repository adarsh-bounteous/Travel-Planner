from pathlib import Path

from loadtest.profile import TEN_THOUSAND_USERS


def test_profile_is_1000_users_2min_ramp_5min_hold():
    p = TEN_THOUSAND_USERS
    assert (p.registered_users, p.concurrent_users) == (10_000, 1_000)
    assert (p.ramp_seconds, p.hold_seconds) == (120, 300)


def test_profile_thresholds():
    assert TEN_THOUSAND_USERS.p95_limit_ms == 500.0
    assert TEN_THOUSAND_USERS.error_rate_limit == 0.01


def test_readme_documents_the_profile():
    readme = (Path(__file__).parents[3] / "README.md").read_text()
    assert "1,000 concurrent" in readme
    assert "10,000" in readme
