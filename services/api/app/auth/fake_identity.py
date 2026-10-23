from dataclasses import dataclass
from urllib.parse import urlencode

from app.auth.identity import (
    EmailNotConfirmed,
    EmailTaken,
    GoogleCancelled,
    NoAccount,
    WrongPassword,
)


@dataclass
class _User:
    user_id: str
    email: str
    password: str
    confirmed: bool = False


class FakeIdentityProvider:
    """In-memory IdentityProvider for tests. Google codes become users named `google-<code>`."""

    def __init__(self) -> None:
        self._users: dict[str, _User] = {}
        self.resent: list[str] = []

    def confirm(self, email: str) -> None:
        self._users[email].confirmed = True

    def account_count(self, email: str) -> int:
        return 1 if email in self._users else 0

    def sign_up_email(self, email: str, password: str) -> None:
        if email in self._users:
            raise EmailTaken
        self._users[email] = _User(f"user-{len(self._users) + 1}", email, password)

    def sign_in_email(self, email: str, password: str) -> str:
        user = self._users.get(email)
        if user is None:
            raise NoAccount
        if user.password != password:
            raise WrongPassword
        if not user.confirmed:
            raise EmailNotConfirmed
        return user.user_id

    def resend_confirmation(self, email: str) -> None:
        self.resent.append(email)

    def email_for(self, user_id: str) -> str:
        for user in self._users.values():
            if user.user_id == user_id:
                return user.email
        return f"{user_id}@google.example"

    def google_authorize_url(self, state: str) -> str:
        return "https://google.example/authorize?" + urlencode({"state": state})

    def complete_google(self, code: str) -> str:
        if code == "cancelled":
            raise GoogleCancelled
        return f"google-{code}"
