"""Local stores with one deliberate difference from the cloud rules each, to prove the shared rules notice."""

from dataclasses import replace
from pathlib import Path

from app.auth.accounts import InMemoryAccountStore
from app.trips.local_profile_store import PersistentProfileStore
from app.trips.local_saved_store import PersistentSavedPlaceStore
from app.trips.local_store import PersistentTripStore
from app.trips.store import InMemoryTripStore
from tests.unit.store_contract import (
    rules_accounts,
    rules_invites,
    rules_profiles,
    rules_saved_places,
    rules_share_links,
    rules_trips,
)
from tests.unit.store_contract.stores import StoreBundle, make_store


class TripIdAloneResolves(PersistentTripStore):
    def get_trip(self, owner_id, trip_id):
        return next((t for (_, tid), t in self._trips.items() if tid == trip_id), None)


class DeleteInviteIsNoop(PersistentTripStore):
    def delete_invite(self, token):
        pass


class DeleteShareLinkIsNoop(PersistentTripStore):
    def delete_share_link(self, token):
        pass


class TripsNotWrittenToDisk(PersistentTripStore):
    def save_trip(self, owner_id, trip):
        InMemoryTripStore.save_trip(self, owner_id, trip)


class GoogleLinkIsGlobal(InMemoryAccountStore):
    def is_google_linked(self, user_id):
        return bool(self._google)


class ProfileKeepsTheFirst(PersistentProfileStore):
    def save_profile(self, owner_id, profile):
        if self.get_profile(owner_id) is None:
            super().save_profile(owner_id, profile)


class SavedKeepsDuplicates(PersistentSavedPlaceStore):
    def save(self, owner_id, place):
        self._saved.setdefault(owner_id, {})[f"{place.id}#{len(self._saved.get(owner_id, {}))}"] = place


def _with(component: str, build):
    def mutant(tmp_path: Path) -> StoreBundle:
        def assemble(bundle: StoreBundle) -> StoreBundle:
            broken = build(getattr(bundle, component))
            return replace(bundle, **{component: broken}, reopen=lambda: assemble(bundle.reopen()))

        return assemble(make_store("local", tmp_path))

    return mutant


def _trip_mutant(cls):
    return _with("trips", lambda old: cls(old._data_file))


MUTANTS = [
    (rules_trips.rule_trip_id_alone_resolves_nothing_for_another_owner, _trip_mutant(TripIdAloneResolves)),
    (rules_trips.rule_trips_survive_a_restart, _trip_mutant(TripsNotWrittenToDisk)),
    (rules_invites.rule_deleted_invite_is_gone, _trip_mutant(DeleteInviteIsNoop)),
    (rules_share_links.rule_deleted_link_is_gone, _trip_mutant(DeleteShareLinkIsNoop)),
    (rules_accounts.rule_google_link_is_per_user, _with("accounts", lambda old: GoogleLinkIsGlobal())),
    (rules_profiles.rule_second_save_replaces_the_first, _with("profiles", lambda old: ProfileKeepsTheFirst(old._data_file))),
    (rules_saved_places.rule_saving_twice_keeps_one_entry, _with("saved", lambda old: SavedKeepsDuplicates(old._data_file))),
]
