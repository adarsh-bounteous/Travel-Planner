import pytest

from loadtest.verdict import evaluate


def test_met_when_p95_and_errors_under_limits():
    v = evaluate(p95_ms=499.9, error_rate=0.0099)
    assert v.met is True
    assert v.reasons == []


@pytest.mark.parametrize("p95_ms", [500.0, 500.1, 2000.0])
def test_not_met_when_p95_at_or_over_500ms(p95_ms):
    v = evaluate(p95_ms=p95_ms, error_rate=0.0)
    assert v.met is False
    assert any("p95" in r for r in v.reasons)


@pytest.mark.parametrize("rate", [0.01, 0.02, 1.0])
def test_not_met_when_error_rate_at_or_over_1_percent(rate):
    v = evaluate(p95_ms=100.0, error_rate=rate)
    assert v.met is False
    assert any("error" in r for r in v.reasons)
