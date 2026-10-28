from collections.abc import Callable
from datetime import UTC, datetime

from app.local_data import LocalDataFile, LocalDataFileError
from app.trips.invites import InMemoryInviteSender

INBOX_FORMAT_VERSION = 1
INBOX_FILE_NAME = "inbox.json"


class PersistentInviteSender(InMemoryInviteSender):
    """Local mode's inbox: the in-memory sender, loaded from and rewritten to its own data file.

    A separate file from the trip store's, which rewrites all of its file with only its own keys.
    """

    def __init__(
        self, data_file: LocalDataFile, clock: Callable[[], datetime] = lambda: datetime.now(UTC)
    ) -> None:
        super().__init__(clock)
        self._data_file = data_file
        self._load()

    def _load(self) -> None:
        data = self._data_file.read()
        if not data:
            return
        path = self._data_file.path
        try:
            if data["version"] != INBOX_FORMAT_VERSION:
                raise LocalDataFileError(path)
            for record in data["messages"]:
                self.sent.append((record["to"], record["trip_name"], record["link"]))
                self.sent_at.append(datetime.fromisoformat(record["sent_at"]))
                if record["kind"] is not None:
                    self.kinds[record["link"]] = record["kind"]
        except (KeyError, TypeError, ValueError) as error:
            raise LocalDataFileError(path) from error

    def _flush(self) -> None:
        self._data_file.write(
            {
                "version": INBOX_FORMAT_VERSION,
                "messages": [
                    {
                        "to": to,
                        "trip_name": trip_name,
                        "link": link,
                        "sent_at": sent_at.isoformat(),
                        "kind": self.kinds.get(link),
                    }
                    for (to, trip_name, link), sent_at in zip(self.sent, self.sent_at, strict=True)
                ],
            }
        )

    def _recorded(self) -> None:
        self._flush()

    def reset(self) -> None:
        super().reset()
        self._flush()
