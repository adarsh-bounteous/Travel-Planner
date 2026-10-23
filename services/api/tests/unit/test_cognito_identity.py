import pytest
from botocore.exceptions import ClientError

from app.auth.cognito_identity import CognitoIdentityProvider
from app.auth.identity import EmailTaken, WrongPassword
from app.config import get_settings


def _error(code):
    return ClientError({"Error": {"Code": code, "Message": code}}, "Op")


class StubClient:
    def __init__(self, auth_error=None, users=None):
        self.calls = []
        self.auth_error = auth_error
        self.users = users or []

    def initiate_auth(self, **kwargs):
        self.calls.append(("initiate_auth", kwargs))
        if self.auth_error:
            raise _error(self.auth_error)
        return {"AuthenticationResult": {"AccessToken": "token"}}

    def list_users(self, **kwargs):
        self.calls.append(("list_users", kwargs))
        return {"Users": self.users}

    def change_password(self, **kwargs):
        self.calls.append(("change_password", kwargs))

    def update_user_attributes(self, **kwargs):
        self.calls.append(("update_user_attributes", kwargs))


def _adapter(client):
    return CognitoIdentityProvider(get_settings(), client=client)


def test_change_password_maps_wrong_password():
    adapter = _adapter(StubClient(auth_error="NotAuthorizedException"))
    with pytest.raises(WrongPassword):
        adapter.change_password("maya@example.com", "wrong", "newpassword12")


def test_change_password_calls_cognito_with_access_token():
    client = StubClient()
    _adapter(client).change_password("maya@example.com", "old", "newpassword12")
    assert client.calls[-1] == (
        "change_password",
        {"PreviousPassword": "old", "ProposedPassword": "newpassword12", "AccessToken": "token"},
    )


def test_email_change_maps_wrong_password():
    adapter = _adapter(StubClient(auth_error="NotAuthorizedException"))
    with pytest.raises(WrongPassword):
        adapter.request_email_change("maya@example.com", "wrong", "new@example.com")


def test_email_change_refuses_address_in_use():
    client = StubClient(users=[{"Username": "other"}])
    with pytest.raises(EmailTaken):
        _adapter(client).request_email_change("maya@example.com", "old", "new@example.com")
    assert "update_user_attributes" not in [name for name, _ in client.calls]


def test_email_change_updates_email_attribute():
    client = StubClient()
    _adapter(client).request_email_change("maya@example.com", "old", "new@example.com")
    assert client.calls[-1] == (
        "update_user_attributes",
        {"UserAttributes": [{"Name": "email", "Value": "new@example.com"}], "AccessToken": "token"},
    )
