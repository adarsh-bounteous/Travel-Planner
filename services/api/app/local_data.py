import json
import os
import threading
from pathlib import Path
from typing import Any

LOCAL_DATA_FILE_NAME = "store.json"


class LocalDataFileError(RuntimeError):
    """The local data file cannot be used. Startup stops rather than overwrite it."""

    def __init__(self, path: Path) -> None:
        self.path = path
        super().__init__(
            f"The local data file {path} is unreadable or corrupted. "
            "Delete it, or empty it, and start the API again."
        )


class LocalDataFile:
    """One JSON file holding local mode's data. Missing or empty means a fresh start."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self._lock = threading.Lock()

    def read(self) -> dict[str, Any]:
        try:
            text = self.path.read_bytes().decode("utf-8")
        except FileNotFoundError:
            return {}
        except (OSError, UnicodeDecodeError) as error:
            raise LocalDataFileError(self.path) from error
        if not text.strip():
            return {}
        try:
            data = json.loads(text)
        except ValueError as error:
            raise LocalDataFileError(self.path) from error
        if not isinstance(data, dict):
            raise LocalDataFileError(self.path)
        return data

    def write(self, data: dict[str, Any]) -> None:
        with self._lock:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            temp = self.path.with_name(self.path.name + ".tmp")
            temp.write_text(json.dumps(data), encoding="utf-8")
            os.replace(temp, self.path)
