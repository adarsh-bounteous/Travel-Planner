from dataclasses import fields

import pytest

from app.config import get_settings
from app.local_mode import (
    LocalModeRefusedError,
    LocalStandIns,
    resolve_local_mode,
    stand_ins_for,
)


def test_unset_means_off(monkeypatch):
    monkeypatch.delenv("LOCAL_MODE", raising=False)
    monkeypatch.delenv("APP_ENV", raising=False)
    assert get_settings().local_mode is False
    assert get_settings().environment == "production"


@pytest.mark.parametrize("value", ["", "false", "off", "0"])
def test_off_values(value):
    assert resolve_local_mode({"LOCAL_MODE": value}) == ("production", False)


@pytest.mark.parametrize("value", ["true", "on", "1", "YES"])
def test_explicit_on_in_local(monkeypatch, value):
    monkeypatch.setenv("LOCAL_MODE", value)
    monkeypatch.setenv("APP_ENV", "local")
    assert get_settings().local_mode is True
    assert get_settings().environment == "local"


def test_unrecognised_value_is_refused():
    with pytest.raises(LocalModeRefusedError):
        resolve_local_mode({"LOCAL_MODE": "ture", "APP_ENV": "local"})


def test_off_means_no_stand_in():
    assert stand_ins_for(False) == LocalStandIns(
        storage=False, sign_in=False, cloud_services=False
    )


@pytest.mark.parametrize("env", ["production", "staging", "", "LOCAL-ish"])
def test_on_outside_local_is_refused(env):
    with pytest.raises(LocalModeRefusedError, match="not local"):
        resolve_local_mode({"LOCAL_MODE": "on", "APP_ENV": env})


def test_on_with_unset_environment_is_refused():
    with pytest.raises(LocalModeRefusedError, match="not local"):
        resolve_local_mode({"LOCAL_MODE": "on"})


def test_on_enables_every_stand_in():
    assert stand_ins_for(True) == LocalStandIns(
        storage=True, sign_in=True, cloud_services=True
    )


def test_stand_ins_flip_together():
    on, off = stand_ins_for(True), stand_ins_for(False)
    assert all(getattr(on, f.name) for f in fields(on))
    assert not any(getattr(off, f.name) for f in fields(off))
