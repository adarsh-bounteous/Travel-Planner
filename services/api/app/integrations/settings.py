from dataclasses import dataclass


@dataclass(frozen=True)
class ProviderSettings:
    """One provider's resilience policy; the only place an adapter declares it."""

    name: str
    base_url: str
    retries: int = 2
    backoff_base_seconds: float = 1.0
    rate_limit_calls: int | None = None
    rate_limit_period_seconds: float | None = None
    breaker_threshold: int = 5
    breaker_cooldown_seconds: float = 30
    cache_ttl_seconds: float = 0
    credential_params: tuple[str, ...] = ()
    credential_headers: tuple[str, ...] = ()
    timeout_seconds: float = 10
