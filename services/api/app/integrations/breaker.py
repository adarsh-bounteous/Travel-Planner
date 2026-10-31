from collections.abc import Callable


class CircuitBreaker:
    """Closed -> open after N consecutive failed calls -> one half-open trial."""

    def __init__(self, threshold: int, cooldown: float, clock: Callable[[], float]) -> None:
        self._threshold = threshold
        self._cooldown = cooldown
        self._clock = clock
        self._failures = 0
        self._opened_at: float | None = None
        self._trial_in_flight = False

    @property
    def is_open(self) -> bool:
        """Whether `allow()` would refuse now, without taking the trial slot."""
        if self._opened_at is None:
            return False
        return self._trial_in_flight or self._clock() - self._opened_at < self._cooldown

    def allow(self) -> bool:
        if self._opened_at is None:
            return True
        if self._trial_in_flight or self._clock() - self._opened_at < self._cooldown:
            return False
        self._trial_in_flight = True
        return True

    def record_success(self) -> None:
        self._failures = 0
        self._opened_at = None
        self._trial_in_flight = False

    def record_failure(self) -> None:
        self._failures += 1
        if self._trial_in_flight or self._failures >= self._threshold:
            self._opened_at = self._clock()
        self._trial_in_flight = False

    def abort_trial(self) -> None:
        """Free the trial slot when a call ended without reaching the provider."""
        self._trial_in_flight = False
