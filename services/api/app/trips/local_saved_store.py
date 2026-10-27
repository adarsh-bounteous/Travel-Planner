from pydantic import ValidationError

from app.local_data import LocalDataFile, LocalDataFileError
from app.places.search import Place
from app.trips.saved_store import InMemorySavedPlaceStore

SAVED_FORMAT_VERSION = 1
SAVED_PLACES_FILE_NAME = "saved-places.json"


class PersistentSavedPlaceStore(InMemorySavedPlaceStore):
    """Local mode's saved places: the in-memory store, loaded from and rewritten to its own data file.

    A separate file from the trip store's, which rewrites all of its file with only its own keys.
    """

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
            if data["version"] != SAVED_FORMAT_VERSION:
                raise LocalDataFileError(path)
            for record in data.get("saved", []):
                place = Place.model_validate(record["place"])
                self._saved.setdefault(record["owner_id"], {})[place.id] = place
        except (KeyError, TypeError, AttributeError, ValidationError) as error:
            raise LocalDataFileError(path) from error

    def _flush(self) -> None:
        self._data_file.write(
            {
                "version": SAVED_FORMAT_VERSION,
                "saved": [
                    {"owner_id": owner, "place": place.model_dump(mode="json")}
                    for owner, places in self._saved.items()
                    for place in places.values()
                ],
            }
        )

    def save(self, owner_id: str, place: Place) -> None:
        super().save(owner_id, place)
        self._flush()

    def unsave(self, owner_id: str, place_id: str) -> None:
        super().unsave(owner_id, place_id)
        self._flush()

    def reset(self) -> None:
        super().reset()
        self._flush()
