from collections.abc import Callable
from dataclasses import dataclass
from enum import Enum

from app.integrations.breaker import CircuitBreaker


class HealthState(str, Enum):
    CONFIGURED = "configured"
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    OPEN_CIRCUIT = "open circuit"
    NOT_CONFIGURED = "not configured"


HEALTH_STATES = {state.value for state in HealthState}


@dataclass
class ProviderEntry:
    name: str
    kind: str
    secret_key: str
    breaker: CircuitBreaker | None = None


class ProviderRegistry:
    def __init__(self, entries: list[ProviderEntry] | None = None) -> None:
        self._entries: list[ProviderEntry] = []
        self._overrides: dict[str, HealthState] = {}
        for entry in entries or []:
            self.register(entry)

    def register(self, entry: ProviderEntry) -> None:
        self._entries.append(entry)

    def health_override(self, name: str, state: HealthState | str) -> None:
        """Let an adapter report healthy or degraded from its call results."""
        self._overrides[name] = HealthState(state)

    def _health(self, entry: ProviderEntry, secret_reader: Callable[[str], str | None]) -> HealthState:
        if secret_reader(entry.secret_key) is None:
            return HealthState.NOT_CONFIGURED
        if entry.breaker is not None and entry.breaker.is_open:
            return HealthState.OPEN_CIRCUIT
        return self._overrides.get(entry.name, HealthState.CONFIGURED)

    def statuses(self, secret_reader: Callable[[str], str | None]) -> list[dict[str, str]]:
        return [
            {"name": e.name, "kind": e.kind, "health": self._health(e, secret_reader).value} for e in self._entries
        ]


def default_registry() -> ProviderRegistry:
    return ProviderRegistry(
        [
            ProviderEntry("places", "maps and places", "PLACES_API_KEY"),
            ProviderEntry("flights", "flight search", "FLIGHT_SEARCH_API_KEY"),
            ProviderEntry("hotels", "hotel search", "HOTEL_SEARCH_API_KEY"),
            ProviderEntry("email", "email", "EMAIL_API_KEY"),
            ProviderEntry("identity", "identity", "IDENTITY_API_KEY"),
        ]
    )
