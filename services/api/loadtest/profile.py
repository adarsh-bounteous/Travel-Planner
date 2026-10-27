from dataclasses import dataclass, replace


@dataclass(frozen=True)
class LoadProfile:
    """Load for a user base: 10% of registered users active at once, one request per ~10 s each."""

    registered_users: int = 10_000
    concurrent_users: int = 1_000
    ramp_seconds: float = 120
    hold_seconds: float = 300
    think_time_seconds: float = 10.0
    p95_limit_ms: float = 500.0
    error_rate_limit: float = 0.01

    def scaled(self, factor: float) -> "LoadProfile":
        """Shorter and smaller, for tests and local smoke runs only. Thresholds are kept."""
        return replace(
            self,
            concurrent_users=max(1, round(self.concurrent_users * factor)),
            ramp_seconds=self.ramp_seconds * factor,
            hold_seconds=self.hold_seconds * factor,
            think_time_seconds=self.think_time_seconds * factor,
        )


TEN_THOUSAND_USERS = LoadProfile()
