from datetime import UTC, datetime, timedelta

import pytest

from app.auth.identity import (
    EmailNotConfirmed,
    EmailTaken,
    LinkAlreadyUsed,
    LinkExpired,
    LinkInvalid,
    NoAccount,
    WrongPassword,
)
from app.auth.local_identity import CONFIRMATION_LINK_LIFETIME, LocalIdentityProvider

EMAIL = "ana@example.com"
PASSWORD = "abcdefghij12"


@pytest.fixture
def env(tmp_path):
    state = {"t": datetime(2026, 1, 1, tzinfo=UTC), "sent": []}
    db = tmp_path / "accounts.sqlite3"

    def make():
        return LocalIdentityProvider(
            db,
            clock=lambda: state["t"],
            send_confirmation=lambda email, link: state["sent"].append((email, link)),
            link_base=lambda: "http://web.test",
        )

    state["make"] = make
    state["db"] = db
    return state


def token_of(env):
    return env["sent"][-1][1].rsplit("/", 1)[1]


def test_sign_up_sends_a_confirmation_link_to_the_address(env):
    provider = env["make"]()
    provider.sign_up_email(EMAIL, PASSWORD)
    [(to, link)] = env["sent"]
    assert to == EMAIL
    assert link.startswith("http://web.test/confirm-email/")


def test_sign_up_twice_is_refused_without_a_second_email(env):
    provider = env["make"]()
    provider.sign_up_email(EMAIL, PASSWORD)
    with pytest.raises(EmailTaken):
        provider.sign_up_email("Ana@Example.com", PASSWORD)
    assert len(env["sent"]) == 1


def test_unconfirmed_account_cannot_sign_in_but_wrong_password_is_reported_first(env):
    provider = env["make"]()
    provider.sign_up_email(EMAIL, PASSWORD)
    with pytest.raises(EmailNotConfirmed):
        provider.sign_in_email(EMAIL, PASSWORD)
    with pytest.raises(WrongPassword):
        provider.sign_in_email(EMAIL, "wrong-password-1")
    with pytest.raises(NoAccount):
        provider.sign_in_email("nobody@example.com", PASSWORD)


def test_confirming_lets_the_account_sign_in(env):
    provider = env["make"]()
    provider.sign_up_email(EMAIL, PASSWORD)
    provider.confirm_email(token_of(env))
    assert provider.sign_in_email(EMAIL, PASSWORD)


def test_expired_link_is_refused_and_account_stays_unconfirmed(env):
    provider = env["make"]()
    provider.sign_up_email(EMAIL, PASSWORD)
    env["t"] += CONFIRMATION_LINK_LIFETIME + timedelta(seconds=1)
    with pytest.raises(LinkExpired):
        provider.confirm_email(token_of(env))
    with pytest.raises(EmailNotConfirmed):
        provider.sign_in_email(EMAIL, PASSWORD)


def test_used_link_is_refused_the_second_time(env):
    provider = env["make"]()
    provider.sign_up_email(EMAIL, PASSWORD)
    token = token_of(env)
    provider.confirm_email(token)
    with pytest.raises(LinkAlreadyUsed):
        provider.confirm_email(token)


def test_unknown_token_is_invalid(env):
    with pytest.raises(LinkInvalid):
        env["make"]().confirm_email("nope")


def test_resend_issues_a_fresh_link_for_an_unconfirmed_account_only(env):
    provider = env["make"]()
    provider.resend_confirmation(EMAIL)
    assert env["sent"] == []
    provider.sign_up_email(EMAIL, PASSWORD)
    provider.resend_confirmation(EMAIL)
    assert len(env["sent"]) == 2
    provider.confirm_email(token_of(env))
    provider.resend_confirmation(EMAIL)
    assert len(env["sent"]) == 2


def test_accounts_survive_a_restart_and_passwords_are_not_stored_in_clear(env):
    env["make"]().create_confirmed_user(EMAIL, PASSWORD)
    second = env["make"]()
    assert second.sign_in_email(EMAIL, PASSWORD)
    assert PASSWORD.encode() not in env["db"].read_bytes()


def test_reset_clears_accounts(env):
    provider = env["make"]()
    provider.create_confirmed_user(EMAIL, PASSWORD)
    assert not provider.is_empty()
    provider.reset()
    assert provider.is_empty()
    assert not provider.account_exists(EMAIL)


def test_google_and_account_changes_are_carried_over(env):
    provider = env["make"]()
    user_id = provider.create_confirmed_user(EMAIL, PASSWORD)
    assert provider.email_for(user_id) == EMAIL
    provider.change_password(EMAIL, PASSWORD, "newpassword123")
    assert provider.sign_in_email(EMAIL, "newpassword123") == user_id
    with pytest.raises(WrongPassword):
        provider.change_password(EMAIL, "bad", "newpassword123")
    assert provider.complete_google("abc") == "google-abc"


def test_created_account_is_found_by_email(env):
    provider = env["make"]()
    provider.create_confirmed_user(EMAIL, PASSWORD)
    assert provider.account_exists(EMAIL)
    assert provider.user_id_for(EMAIL).startswith("user-")


def test_account_is_found_after_restart(env):
    env["make"]().create_confirmed_user(EMAIL, PASSWORD)
    restarted = env["make"]()
    assert restarted.account_exists(EMAIL)
    assert restarted.user_id_for(EMAIL)


def test_differently_cased_email_is_a_duplicate(env):
    provider = env["make"]()
    provider.create_confirmed_user("anna@example.com", PASSWORD)
    with pytest.raises(EmailTaken):
        provider.create_confirmed_user("Anna@Example.com", PASSWORD)
    with pytest.raises(EmailTaken):
        provider.sign_up_email("Anna@Example.com", PASSWORD)


def test_same_email_is_refused(env):
    provider = env["make"]()
    provider.create_confirmed_user("anna@example.com", PASSWORD)
    with pytest.raises(EmailTaken):
        provider.create_confirmed_user("anna@example.com", PASSWORD)
    assert provider.account_exists("anna@example.com")


def test_lookup_ignores_email_case_and_refused_duplicate_changes_nothing(env):
    provider = env["make"]()
    user_id = provider.create_confirmed_user("anna@example.com", PASSWORD)
    assert provider.account_exists("Anna@Example.com")
    assert provider.user_id_for("Anna@Example.com") == user_id
    with pytest.raises(EmailTaken):
        provider.create_confirmed_user("anna@example.com", "differentpass99")
    assert provider.sign_in_email("anna@example.com", PASSWORD) == user_id
