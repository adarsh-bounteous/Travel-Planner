class IntegrationError(Exception):
    """Base class for failures raised by the shared integration client."""


class RateLimitError(IntegrationError):
    """The provider's local rate limit is reached; no request was sent."""


class CircuitOpenError(IntegrationError):
    """The provider's circuit breaker is open; no request was sent."""


class ProviderUnavailableError(IntegrationError):
    """Retries are exhausted. last_status is None after a connection error."""

    def __init__(self, provider: str, last_status: int | None) -> None:
        super().__init__(f"{provider} unavailable (last status: {last_status})")
        self.provider = provider
        self.last_status = last_status
