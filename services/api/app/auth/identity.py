from typing import Protocol


class IdentityError(Exception):
    pass


class WrongPassword(IdentityError):
    pass


class NoAccount(IdentityError):
    pass


class EmailNotConfirmed(IdentityError):
    pass


class EmailTaken(IdentityError):
    pass


class GoogleCancelled(IdentityError):
    pass


class IdentityProvider(Protocol):
    """The Identity Provider (ADR-0009). Confirmation email delivery is its job (ADR-0010)."""

    def sign_up_email(self, email: str, password: str) -> None:
        """Create an unconfirmed account and send the confirmation email. Raises EmailTaken."""

    def sign_in_email(self, email: str, password: str) -> str:
        """Return the user id. Raises WrongPassword, NoAccount, EmailNotConfirmed."""

    def resend_confirmation(self, email: str) -> None: ...

    def email_for(self, user_id: str) -> str: ...

    def google_authorize_url(self, state: str) -> str: ...

    def complete_google(self, code: str) -> str:
        """Return the user id of the Google identity. Raises GoogleCancelled."""
