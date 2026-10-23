import os
from dataclasses import dataclass


class MissingSettingError(RuntimeError):
    pass


@dataclass(frozen=True)
class Settings:
    session_secret: str
    identity_user_pool_id: str
    identity_client_id: str
    identity_domain: str
    google_redirect_uri: str
    web_origin: str
    accounts_table_name: str
    trips_table_name: str
    cookie_secure: bool


def session_secret() -> bytes:
    """The key sessions are signed with. No default: a missing key fails closed."""
    secret = os.environ.get("SESSION_SECRET", "")
    if not secret:
        raise MissingSettingError("SESSION_SECRET must be set")
    return secret.encode()


def get_settings() -> Settings:
    env = os.environ
    return Settings(
        session_secret=env.get("SESSION_SECRET", ""),
        identity_user_pool_id=env.get("IDENTITY_USER_POOL_ID", ""),
        identity_client_id=env.get("IDENTITY_CLIENT_ID", ""),
        identity_domain=env.get("IDENTITY_DOMAIN", ""),
        google_redirect_uri=env.get("GOOGLE_REDIRECT_URI", ""),
        web_origin=env.get("WEB_ORIGIN", "").rstrip("/"),
        accounts_table_name=env.get("ACCOUNTS_TABLE_NAME", "trip-planner-accounts"),
        trips_table_name=env.get("TRIPS_TABLE_NAME", "trip-planner-trips"),
        cookie_secure=env.get("COOKIE_SECURE", "true").lower() != "false",
    )
