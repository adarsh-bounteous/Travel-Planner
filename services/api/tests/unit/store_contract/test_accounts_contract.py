from datetime import datetime

import pytest

from app.auth.fake_identity import FakeIdentityProvider
from app.auth.local_identity import LocalIdentityProvider
from tests.unit.store_contract import rules_accounts


def test_google_is_not_linked_until_linked(store):
    rules_accounts.rule_google_is_not_linked_until_linked(store)


def test_google_link_is_per_user(store):
    rules_accounts.rule_google_link_is_per_user(store)


@pytest.fixture(params=["local", "fake"])
def identity(request, tmp_path):
    if request.param == "fake":
        provider = FakeIdentityProvider()
        return provider, provider.confirm
    provider = LocalIdentityProvider(
        tmp_path / "identity.sqlite3",
        clock=lambda: datetime(2026, 1, 1),
        send_confirmation=lambda email, link: None,
        link_base=lambda: "http://localhost",
    )
    return provider, lambda email: provider._run("UPDATE users SET confirmed = 1 WHERE email = ?", email)


def test_unconfirmed_account_cannot_sign_in(identity):
    rules_accounts.rule_unconfirmed_account_cannot_sign_in(identity)


def test_confirmed_account_signs_in_with_its_password(identity):
    rules_accounts.rule_confirmed_account_signs_in_with_its_password(identity)


def test_unknown_email_has_no_account(identity):
    rules_accounts.rule_unknown_email_has_no_account(identity)


def test_second_sign_up_with_same_email_is_refused(identity):
    rules_accounts.rule_second_sign_up_with_same_email_is_refused(identity)


def test_wrong_password_change_is_refused(identity):
    rules_accounts.rule_wrong_password_change_is_refused(identity)
