import os
from dataclasses import dataclass
from pathlib import Path

from app.local_mode import local_mode_override, resolve_live_providers, resolve_local_mode


DEFAULT_LOCAL_DATA_DIR = Path(__file__).resolve().parent.parent / ".local-data"


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
    invite_from_address: str = ""
    availability_table_name: str = "trip-planner-availability"
    oncall_alert_topic_arn: str = ""
    public_health_url: str = ""
    environment: str = "production"
    local_mode: bool = False
    nominatim_base_url: str = "https://nominatim.openstreetmap.org"
    nominatim_user_agent: str = "trip-planner-api"
    local_data_dir: Path = DEFAULT_LOCAL_DATA_DIR
    live_providers: frozenset[str] = frozenset()
    osm_tile_url_template: str = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
    osm_user_agent: str = ""
    osm_referer: str = ""  # falls back to web_origin

    @property
    def map_tiles_enabled(self) -> bool:
        """Real map tiles only where the places source is live: always outside local mode, opt-in inside it."""
        return (not self.local_mode) or "places" in self.live_providers


def session_secret() -> bytes:
    """The key sessions are signed with. No default: a missing key fails closed."""
    secret = os.environ.get("SESSION_SECRET", "")
    if not secret:
        raise MissingSettingError("SESSION_SECRET must be set")
    return secret.encode()


def get_settings() -> Settings:
    env = os.environ
    environment, local_mode = resolve_local_mode(env, local_mode_override())
    return Settings(
        environment=environment,
        local_mode=local_mode,
        session_secret=env.get("SESSION_SECRET", ""),
        identity_user_pool_id=env.get("IDENTITY_USER_POOL_ID", ""),
        identity_client_id=env.get("IDENTITY_CLIENT_ID", ""),
        identity_domain=env.get("IDENTITY_DOMAIN", ""),
        google_redirect_uri=env.get("GOOGLE_REDIRECT_URI", ""),
        web_origin=env.get("WEB_ORIGIN", "").rstrip("/"),
        accounts_table_name=env.get("ACCOUNTS_TABLE_NAME", "trip-planner-accounts"),
        trips_table_name=env.get("TRIPS_TABLE_NAME", "trip-planner-trips"),
        cookie_secure=env.get("COOKIE_SECURE", "true").lower() != "false",
        invite_from_address=env.get("INVITE_FROM_ADDRESS", ""),
        availability_table_name=env.get("AVAILABILITY_TABLE_NAME", "trip-planner-availability"),
        oncall_alert_topic_arn=env.get("ONCALL_ALERT_TOPIC_ARN", ""),
        public_health_url=env.get("PUBLIC_HEALTH_URL", ""),
        nominatim_base_url=env.get("NOMINATIM_BASE_URL") or "https://nominatim.openstreetmap.org",
        nominatim_user_agent=env.get("NOMINATIM_USER_AGENT") or "trip-planner-api",
        local_data_dir=Path(env.get("LOCAL_DATA_DIR") or DEFAULT_LOCAL_DATA_DIR),
        live_providers=resolve_live_providers(env),
        osm_tile_url_template=env.get("OSM_TILE_URL_TEMPLATE") or Settings.osm_tile_url_template,
        osm_user_agent=env.get("OSM_USER_AGENT", ""),
        osm_referer=env.get("OSM_REFERER", ""),
    )
