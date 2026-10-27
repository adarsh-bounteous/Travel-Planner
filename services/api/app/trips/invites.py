from collections.abc import Callable
from datetime import UTC, datetime
from typing import Protocol


class InviteSender(Protocol):
    """Delivers an editor invite link (ADR-0010). Sending is best effort; the owner can always copy the link."""

    def send(self, email: str, trip_name: str, link: str) -> None: ...


class InMemoryInviteSender:
    def __init__(self, clock: Callable[[], datetime] = lambda: datetime.now(UTC)) -> None:
        self._clock = clock
        self.sent: list[tuple[str, str, str]] = []
        self.sent_at: list[datetime] = []
        self.kinds: dict[str, str] = {}

    def reset(self) -> None:
        self.sent.clear()
        self.sent_at.clear()
        self.kinds.clear()

    def _record(self, email: str, trip_name: str, link: str) -> None:
        self.sent.append((email, trip_name, link))
        self.sent_at.append(self._clock())

    def send(self, email: str, trip_name: str, link: str) -> None:
        self._record(email, trip_name, link)

    def send_confirmation(self, email: str, link: str, kind: str = "confirmation") -> None:
        """An empty trip name marks a confirmation rather than an invite; `kind` says which."""
        self._record(email, "", link)
        self.kinds[link] = kind


class NoInviteSender:
    """Used when INVITE_FROM_ADDRESS is unset: nothing is sent, the owner shares the link."""

    def send(self, email: str, trip_name: str, link: str) -> None:
        return None


class SesInviteSender:
    def __init__(self, from_address: str) -> None:
        import boto3

        self._from = from_address
        self._ses = boto3.client("ses")

    def send(self, email: str, trip_name: str, link: str) -> None:
        self._ses.send_email(
            Source=self._from,
            Destination={"ToAddresses": [email]},
            Message={
                "Subject": {"Data": f"You're invited to plan {trip_name}"},
                "Body": {"Text": {"Data": f"Sign in with {email} to open the trip: {link}"}},
            },
        )
