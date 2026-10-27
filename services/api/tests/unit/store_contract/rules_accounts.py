from app.auth.identity import EmailNotConfirmed, EmailTaken, NoAccount, WrongPassword

PASSWORD = "test-password-1"


def rule_google_is_not_linked_until_linked(store):
    user = store.new_id()
    assert store.accounts.is_google_linked(user) is False
    store.accounts.link_google(user)
    assert store.accounts.is_google_linked(user) is True


def rule_google_link_is_per_user(store):
    user, other = store.new_id(), store.new_id()
    store.accounts.link_google(user)
    assert store.accounts.is_google_linked(other) is False


# Identity rules: Cognito is not a table, so these are shared by the other IdentityProvider
# implementations (the local SQLite one and the in-memory fake). `identity` is (provider, confirm).


def _raises(error, call):
    try:
        call()
    except error:
        return
    raise AssertionError(f"expected {error.__name__}")


def rule_unconfirmed_account_cannot_sign_in(identity):
    provider, _ = identity
    provider.sign_up_email("ana@example.com", PASSWORD)
    _raises(EmailNotConfirmed, lambda: provider.sign_in_email("ana@example.com", PASSWORD))


def rule_confirmed_account_signs_in_with_its_password(identity):
    provider, confirm = identity
    provider.sign_up_email("ana@example.com", PASSWORD)
    confirm("ana@example.com")
    user_id = provider.sign_in_email("ana@example.com", PASSWORD)
    assert provider.sign_in_email("ana@example.com", PASSWORD) == user_id
    _raises(WrongPassword, lambda: provider.sign_in_email("ana@example.com", "wrong-password"))


def rule_unknown_email_has_no_account(identity):
    provider, _ = identity
    _raises(NoAccount, lambda: provider.sign_in_email("nobody@example.com", PASSWORD))


def rule_second_sign_up_with_same_email_is_refused(identity):
    provider, _ = identity
    provider.sign_up_email("ana@example.com", PASSWORD)
    _raises(EmailTaken, lambda: provider.sign_up_email("ana@example.com", PASSWORD))


def rule_wrong_password_change_is_refused(identity):
    provider, confirm = identity
    provider.sign_up_email("ana@example.com", PASSWORD)
    confirm("ana@example.com")
    _raises(WrongPassword, lambda: provider.change_password("ana@example.com", "wrong-password", "new-password-1"))
    provider.change_password("ana@example.com", PASSWORD, "new-password-1")
    provider.sign_in_email("ana@example.com", "new-password-1")
