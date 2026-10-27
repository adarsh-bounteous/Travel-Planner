from pydantic import ValidationError

from app.local_data import LocalDataFile, LocalDataFileError
from app.trips.store import InMemoryTripStore, Invite, ShareLink, Trip

FORMAT_VERSION = 1


class PersistentTripStore(InMemoryTripStore):
    """Local mode's trip storage: the in-memory store, loaded from and rewritten to a data file."""

    def __init__(self, data_file: LocalDataFile) -> None:
        super().__init__()
        self._data_file = data_file
        self._load()

    def _load(self) -> None:
        data = self._data_file.read()
        if not data:
            return
        path = self._data_file.path
        try:
            if data["version"] != FORMAT_VERSION:
                raise LocalDataFileError(path)
            for record in data.get("trips", []):
                trip = Trip.model_validate(record["trip"])
                self._trips[(record["owner_id"], trip.id)] = trip
            for record in data.get("invites", []):
                invite = Invite.model_validate(record)
                self._invites[invite.token] = invite
            for record in data.get("share_links", []):
                link = ShareLink.model_validate(record)
                self._share_links[link.token] = link
            for record in data.get("editors", []):
                self._editors[(record["email"], record["trip_id"])] = record["owner_id"]
        except (KeyError, TypeError, AttributeError, ValidationError) as error:
            raise LocalDataFileError(path) from error

    def _flush(self) -> None:
        self._data_file.write(
            {
                "version": FORMAT_VERSION,
                "trips": [
                    {"owner_id": owner, "trip": trip.model_dump(mode="json")}
                    for (owner, _), trip in self._trips.items()
                ],
                "invites": [i.model_dump(mode="json") for i in self._invites.values()],
                "share_links": [s.model_dump(mode="json") for s in self._share_links.values()],
                "editors": [
                    {"email": email, "trip_id": trip_id, "owner_id": owner}
                    for (email, trip_id), owner in self._editors.items()
                ],
            }
        )

    def reset(self) -> None:
        super().reset()
        self._flush()

    def save_trip(self, owner_id: str, trip: Trip) -> None:
        super().save_trip(owner_id, trip)
        self._flush()

    def delete_trip(self, owner_id: str, trip_id: str) -> None:
        super().delete_trip(owner_id, trip_id)
        self._flush()

    def save_invite(self, invite: Invite) -> None:
        super().save_invite(invite)
        self._flush()

    def delete_invite(self, token: str) -> None:
        super().delete_invite(token)
        self._flush()

    def save_share_link(self, link: ShareLink) -> None:
        super().save_share_link(link)
        self._flush()

    def delete_share_link(self, token: str) -> None:
        super().delete_share_link(token)
        self._flush()

    def link_editor(self, email: str, owner_id: str, trip_id: str) -> None:
        super().link_editor(email, owner_id, trip_id)
        self._flush()

    def unlink_editor(self, email: str, trip_id: str) -> None:
        super().unlink_editor(email, trip_id)
        self._flush()
