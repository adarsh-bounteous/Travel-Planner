from collections.abc import Mapping
from dataclasses import dataclass

from app.providers.registry import default_registry

LOCAL_ENVIRONMENT = "local"
_OFF = {"", "false", "off", "0"}
_ON = {"true", "on", "1", "yes"}


KNOWN_LIVE_PROVIDERS = default_registry().names()


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


def resolve_live_providers(env: Mapping[str, str]) -> frozenset[str]:
    """The sources opted in to a live provider in local mode (LOCAL_LIVE_PROVIDERS, comma separated)."""
    names = frozenset(n.strip() for n in env.get("LOCAL_LIVE_PROVIDERS", "").split(",") if n.strip())
    unknown = names - KNOWN_LIVE_PROVIDERS
    if unknown:
        raise LocalModeRefusedError(
            f"LOCAL_LIVE_PROVIDERS names unknown provider(s) {sorted(unknown)}. "
            f"Known: {sorted(KNOWN_LIVE_PROVIDERS)}."
        )
    return names
