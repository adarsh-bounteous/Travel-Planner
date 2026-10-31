import inspect
from datetime import UTC, datetime

import pytest

import app.flights.options
import app.trips.rates
from app.integrations import FallbackError, with_fallback

T0 = datetime(2026, 1, 1, tzinfo=UTC)


def boom():
    raise RuntimeError("down")


def test_primary_result_is_returned_unchanged():
    payload = [1, 2]
    assert with_fallback(lambda: payload, lambda: [9]).result is payload


def test_primary_result_carries_live_source():
    assert with_fallback(lambda: [1], lambda: [9]).source == "live"


def test_primary_result_carries_as_of():
    assert with_fallback(lambda: [1], lambda: [9], now=lambda: T0).as_of == T0


def test_primary_failure_returns_fallback_result():
    saved = [9]
    assert with_fallback(boom, lambda: saved).result is saved


def test_primary_failure_marks_source_fallback():
    assert with_fallback(boom, lambda: [9]).source == "fallback"


def test_primary_failure_carries_as_of():
    assert with_fallback(boom, lambda: [9], now=lambda: T0).as_of == T0


def test_existing_modules_do_not_use_fallback():
    source = inspect.getsource(app.trips.rates) + inspect.getsource(app.flights.options)
    assert "fallback" not in source


def test_both_failing_raises_error_with_both_reasons():
    def also_boom():
        raise ValueError("no cache")

    with pytest.raises(FallbackError) as e:
        with_fallback(boom, also_boom)
    assert "down" in str(e.value) and "no cache" in str(e.value)


def test_empty_primary_falls_back():
    out = with_fallback(lambda: [], lambda: [9])
    assert out.result == [9] and out.source == "fallback"


def test_empty_primary_and_failing_fallback_raises():
    with pytest.raises(FallbackError):
        with_fallback(lambda: None, boom)


def test_falsy_scalar_is_a_real_result():
    out = with_fallback(lambda: 0, lambda: 9)
    assert out.result == 0 and out.source == "live"
