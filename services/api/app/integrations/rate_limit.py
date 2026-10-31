from collections import deque
from collections.abc import Callable


class RateLimiter:
    """Sliding window: at most `calls` acquisitions in any `period` seconds."""

    def __init__(self, calls: int, period: float, clock: Callable[[], float]) -> None:
        self._calls = calls
        self._period = period
        self._clock = clock
        self._stamps: deque[float] = deque()

    def try_acquire(self) -> bool:
        now = self._clock()
        while self._stamps and now - self._stamps[0] >= self._period:
            self._stamps.popleft()
        if len(self._stamps) >= self._calls:
            return False
        self._stamps.append(now)
        return True
