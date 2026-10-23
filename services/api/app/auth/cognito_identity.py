import base64
import json
import urllib.error
import urllib.parse
import urllib.request

import boto3
from botocore.exceptions import ClientError

from app.auth.identity import (
    EmailNotConfirmed,
    EmailTaken,
    GoogleCancelled,
    IdentityError,
    NoAccount,
    WrongPassword,
)
from app.config import Settings


class CognitoIdentityProvider:
    """Amazon Cognito user pool with Google federation (see ADR-0009)."""

    def __init__(self, settings: Settings, client=None) -> None:
        self._settings = settings
        self._client = client or boto3.client("cognito-idp")

    def _code(self, error: ClientError) -> str:
        return error.response.get("Error", {}).get("Code", "")

    def sign_up_email(self, email: str, password: str) -> None:
        try:
            self._client.sign_up(
                ClientId=self._settings.identity_client_id,
                Username=email,
                Password=password,
                UserAttributes=[{"Name": "email", "Value": email}],
            )
        except ClientError as error:
            if self._code(error) == "UsernameExistsException":
                raise EmailTaken from error
            raise IdentityError from error

    def sign_in_email(self, email: str, password: str) -> str:
        try:
            result = self._client.initiate_auth(
                ClientId=self._settings.identity_client_id,
                AuthFlow="USER_PASSWORD_AUTH",
                AuthParameters={"USERNAME": email, "PASSWORD": password},
            )
            access_token = result["AuthenticationResult"]["AccessToken"]
            user = self._client.get_user(AccessToken=access_token)
        except ClientError as error:
            code = self._code(error)
            if code == "UserNotFoundException":
                raise NoAccount from error
            if code == "NotAuthorizedException":
                raise WrongPassword from error
            if code == "UserNotConfirmedException":
                raise EmailNotConfirmed from error
            raise IdentityError from error
        return next(a["Value"] for a in user["UserAttributes"] if a["Name"] == "sub")

    def resend_confirmation(self, email: str) -> None:
        try:
            self._client.resend_confirmation_code(
                ClientId=self._settings.identity_client_id, Username=email
            )
        except ClientError as error:
            raise IdentityError from error

    def email_for(self, user_id: str) -> str:
        user = self._client.list_users(
            UserPoolId=self._settings.identity_user_pool_id,
            Filter=f'sub = "{user_id}"',
            Limit=1,
        )["Users"][0]
        return next(a["Value"] for a in user["Attributes"] if a["Name"] == "email")

    def google_authorize_url(self, state: str) -> str:
        query = urllib.parse.urlencode(
            {
                "client_id": self._settings.identity_client_id,
                "response_type": "code",
                "scope": "openid email",
                "identity_provider": "Google",
                "redirect_uri": self._settings.google_redirect_uri,
                "state": state,
            }
        )
        return f"https://{self._settings.identity_domain}/oauth2/authorize?{query}"

    def complete_google(self, code: str) -> str:
        body = urllib.parse.urlencode(
            {
                "grant_type": "authorization_code",
                "client_id": self._settings.identity_client_id,
                "code": code,
                "redirect_uri": self._settings.google_redirect_uri,
            }
        ).encode()
        request = urllib.request.Request(
            f"https://{self._settings.identity_domain}/oauth2/token", data=body
        )
        try:
            with urllib.request.urlopen(request, timeout=10) as response:  # noqa: S310
                id_token = json.load(response)["id_token"]
        except (urllib.error.URLError, KeyError, ValueError) as error:
            raise GoogleCancelled from error
        # The token came straight from the user pool's token endpoint over TLS.
        claims = id_token.split(".")[1]
        claims += "=" * (-len(claims) % 4)
        return json.loads(base64.urlsafe_b64decode(claims))["sub"]
