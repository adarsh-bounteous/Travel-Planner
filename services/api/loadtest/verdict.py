from dataclasses import dataclass

from loadtest.profile import TEN_THOUSAND_USERS, LoadProfile


@dataclass(frozen=True)
class Verdict:
    met: bool
    p95_ms: float
    error_rate: float
    reasons: list[str]


def evaluate(
    p95_ms: float, error_rate: float, profile: LoadProfile = TEN_THOUSAND_USERS
) -> Verdict:
    """Capacity is met only when both measures are strictly under their limits."""
    reasons = []
    if not p95_ms < profile.p95_limit_ms:
        reasons.append(f"p95 {p95_ms:.1f} ms is not under {profile.p95_limit_ms:.0f} ms")
    if not error_rate < profile.error_rate_limit:
        reasons.append(
            f"error rate {error_rate:.2%} is not under {profile.error_rate_limit:.0%}"
        )
    return Verdict(not reasons, p95_ms, error_rate, reasons)
