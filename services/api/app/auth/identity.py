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


class LinkInvalid(IdentityError):
    pass


class LinkExpired(IdentityError):
    pass


class LinkAlreadyUsed(IdentityError):
    pass


class IdentityProvider(Protocol):
    """The Identity Provider (ADR-0009). Confirmation email delivery is its job (ADR-0010)."""

    def sign_up_email(self, email: str, password: str) -> None:
        """Create an unconfirmed account and send the confirmation email. Raises EmailTaken."""

    def sign_in_email(self, email: str, password: str) -> str:
        """Return the user id. Raises WrongPassword, NoAccount, EmailNotConfirmed."""

    def resend_confirmation(self, email: str) -> None: ...

    def email_for(self, user_id: str) -> str: ...

    def request_email_change(self, email: str, current_password: str, new_email: str) -> None:
        """Verify current_password, then start a verified change to new_email. The old
        email stays active until the link is opened. Raises WrongPassword, EmailTaken."""

    def change_password(self, email: str, current_password: str, new_password: str) -> None:
        """Raises WrongPassword."""

    def google_authorize_url(self, state: str) -> str: ...

    def complete_google(self, code: str) -> str:
        """Return the user id of the Google identity. Raises GoogleCancelled."""
