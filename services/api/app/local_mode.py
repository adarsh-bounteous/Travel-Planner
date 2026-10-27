from collections.abc import Mapping
from dataclasses import dataclass

LOCAL_ENVIRONMENT = "local"
_OFF = {"", "false", "off", "0"}
_ON = {"true", "on", "1", "yes"}


class LocalModeRefusedError(RuntimeError):
    pass


@dataclass(frozen=True)
class LocalStandIns:
    """Every local stand-in follows the one switch; add new ones here."""

    storage: bool
    sign_in: bool
    cloud_services: bool
    travel_search: bool


_override: bool | None = None


def set_local_mode_override(on: bool) -> None:
    """Turn the switch on or off for this process only. Memory only, never stored."""
    global _override
    _override = on


def clear_local_mode_override() -> None:
    global _override
    _override = None


def local_mode_override() -> bool | None:
    return _override


def resolve_local_mode(env: Mapping[str, str], override: bool | None = None) -> tuple[str, bool]:
    """Return (environment, local_mode); refuse anything that could leak local mode into a deploy.

    `override` is a runtime choice of the switch: False wins over LOCAL_MODE, True is
    refused outside the local environment, None leaves the environment's value alone.
    """
    environment = env.get("APP_ENV", "") or "production"
    if override is False:
        return environment, False
    if override is True:
        if environment != LOCAL_ENVIRONMENT:
            raise LocalModeRefusedError(
                "Local mode is not allowed in live deployments. The switch stays off."
            )
        return environment, True
    value = env.get("LOCAL_MODE", "").strip().lower()
    if value in _OFF:
        return environment, False
    if value not in _ON:
        raise LocalModeRefusedError(
            f"LOCAL_MODE has an unrecognised value {value!r}. Set it to on or off."
        )
    if environment != LOCAL_ENVIRONMENT:
        raise LocalModeRefusedError(
            "Local mode is on, but this environment is not local. "
            "Set LOCAL_MODE to off, or run in the local environment."
        )
    return environment, True


def stand_ins_for(local_mode: bool) -> LocalStandIns:
    return LocalStandIns(
        storage=local_mode,
        sign_in=local_mode,
        cloud_services=local_mode,
        travel_search=local_mode,
    )
