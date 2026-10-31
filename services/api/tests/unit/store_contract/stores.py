from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal
from uuid import uuid4

import boto3
from botocore.exceptions import (
    ClientError,
    EndpointConnectionError,
    NoCredentialsError,
    NoRegionError,
)

from datetime import datetime

from app.auth.fake_identity import FakeIdentityProvider
from app.auth.local_identity import LocalIdentityProvider
from app.auth.accounts import DynamoAccountStore, InMemoryAccountStore
from app.config import get_settings
from app.local_data import LOCAL_DATA_FILE_NAME, LocalDataFile
from app.trips.local_profile_store import PROFILES_FILE_NAME, PersistentProfileStore
from app.trips.local_saved_store import SAVED_PLACES_FILE_NAME, PersistentSavedPlaceStore
from app.trips.local_store import PersistentTripStore
from app.trips.profile_store import DynamoProfileStore
from app.trips.saved_store import DynamoSavedPlaceStore
from app.trips.store import DynamoTripStore
from tests.unit.contract_kit import collect_rules
from tests.unit.store_contract import (
    rules_accounts,
    rules_invites,
    rules_profiles,
    rules_saved_places,
    rules_share_links,
    rules_trips,
)

StoreKind = Literal["local", "cloud"]

_ABSENT = (ClientError, NoCredentialsError, NoRegionError, EndpointConnectionError)


def cloud_tables_present(client_factory: Callable[[], object] = lambda: boto3.client("dynamodb")) -> bool:
    """True only when both the trips and accounts tables can be described with the default credentials."""
    settings = get_settings()
    try:
        client = client_factory()
        for name in (settings.trips_table_name, settings.accounts_table_name):
            client.describe_table(TableName=name)
    except _ABSENT:
        return False
    return True


@dataclass
class StoreBundle:
    """Every store a rule may use, plus unique ids so a shared real table is never polluted."""

    kind: StoreKind
    trips: object
    profiles: object
    saved: object
    accounts: object
    reopen: Callable[[], "StoreBundle"]
    cleanup: Callable[[], None] = lambda: None
    _ids: list[str] = field(default_factory=list)

    def new_id(self) -> str:
        value = f"contract-{uuid4().hex}"
        self._ids.append(value)
        return value

    def new_email(self) -> str:
        return f"{self.new_id()}@example.com"


def _local(tmp_path: Path) -> StoreBundle:
    def build() -> StoreBundle:
        return StoreBundle(
            kind="local",
            trips=PersistentTripStore(LocalDataFile(tmp_path / LOCAL_DATA_FILE_NAME)),
            profiles=PersistentProfileStore(LocalDataFile(tmp_path / PROFILES_FILE_NAME)),
            saved=PersistentSavedPlaceStore(LocalDataFile(tmp_path / SAVED_PLACES_FILE_NAME)),
            accounts=InMemoryAccountStore(),
            reopen=build,
        )

    return build()


def _cloud() -> StoreBundle:
    settings = get_settings()
    accounts_table = boto3.resource("dynamodb").Table(settings.accounts_table_name)

    def build() -> StoreBundle:
        bundle = StoreBundle(
            kind="cloud",
            trips=DynamoTripStore(settings.trips_table_name),
            profiles=DynamoProfileStore(settings.accounts_table_name),
            saved=DynamoSavedPlaceStore(settings.accounts_table_name),
            accounts=DynamoAccountStore(settings.accounts_table_name),
            reopen=build,
        )
        bundle.cleanup = lambda: _clean(bundle, accounts_table)
        return bundle

    return build()


def _clean(bundle: StoreBundle, accounts_table) -> None:
    for value in bundle._ids:
        bundle.trips.delete_invite(value)
        bundle.trips.delete_share_link(value)
        for _, trip_id in bundle.trips.shared_trips(value):
            bundle.trips.unlink_editor(value, trip_id)
        for trip in bundle.trips.list_trips(value):
            bundle.trips.delete_trip(value, trip.id)
        accounts_table.delete_item(Key={"pk": f"USER#{value}"})


def make_store(kind: StoreKind, tmp_path: Path) -> StoreBundle:
    return _local(tmp_path) if kind == "local" else _cloud()


STORE_RULES = collect_rules(
    rules_trips, rules_invites, rules_share_links, rules_accounts, rules_profiles, rules_saved_places
)


def store_adapters(tmp_path: Path) -> dict[str, Callable[[], StoreBundle]]:
    """Local always; cloud only when its tables exist."""
    adapters = {"local": lambda: _with_identity(make_store("local", tmp_path), _local_identity(tmp_path))}
    if cloud_tables_present():
        adapters["cloud"] = lambda: _with_identity(make_store("cloud", tmp_path), _fake_identity)
    return adapters


class _ContractBundle(StoreBundle):
    """A store bundle that also unpacks as (identity provider, confirm), which the identity rules expect."""

    identity: Callable[[], tuple] = lambda: ()

    def __iter__(self):
        return iter(self.identity())


def _with_identity(bundle: StoreBundle, identity: Callable[[], tuple]) -> _ContractBundle:
    wrapped = _ContractBundle(**{f: getattr(bundle, f) for f in bundle.__dataclass_fields__})
    wrapped.identity = identity
    return wrapped


def _fake_identity() -> tuple:
    provider = FakeIdentityProvider()
    return provider, provider.confirm


def _local_identity(tmp_path: Path) -> Callable[[], tuple]:
    def build() -> tuple:
        fresh = tmp_path / f"identity-{uuid4().hex}"
        fresh.mkdir()
        provider = LocalIdentityProvider(
            fresh / "identity.sqlite3",
            clock=lambda: datetime(2026, 1, 1),
            send_confirmation=lambda email, link: None,
            link_base=lambda: "http://localhost",
        )
        return provider, lambda email: provider._run("UPDATE users SET confirmed = 1 WHERE email = ?", email)

    return build
