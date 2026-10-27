from pydantic import ValidationError

from app.local_data import LocalDataFile, LocalDataFileError
from app.trips.profile_store import InMemoryProfileStore, Profile

PROFILES_FILE_NAME = "profiles.json"
PROFILES_FORMAT_VERSION = 1


class PersistentProfileStore(InMemoryProfileStore):
    """Local mode's profile storage: the in-memory store, loaded from and rewritten to its own data file."""

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
            if data["version"] != PROFILES_FORMAT_VERSION:
                raise LocalDataFileError(path)
            for record in data.get("profiles", []):
                self._profiles[record["owner_id"]] = Profile.model_validate(record["profile"])
        except (KeyError, TypeError, AttributeError, ValidationError) as error:
            raise LocalDataFileError(path) from error

    def _flush(self) -> None:
        self._data_file.write(
            {
                "version": PROFILES_FORMAT_VERSION,
                "profiles": [
                    {"owner_id": owner, "profile": profile.model_dump(mode="json")}
                    for owner, profile in self._profiles.items()
                ],
            }
        )

    def save_profile(self, owner_id: str, profile: Profile) -> None:
        super().save_profile(owner_id, profile)
        self._flush()

    def reset(self) -> None:
        super().reset()
        self._flush()
