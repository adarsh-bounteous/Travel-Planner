import json

import pytest

from app.local_data import LocalDataFile, LocalDataFileError
from app.trips.local_profile_store import PersistentProfileStore
from app.trips.profile_store import Profile, TransportPreferences

PROFILE = Profile(
    display_name="Maya", tastes=["Food"], transport_preferences=TransportPreferences(modes=["train"], cabin="economy")
)


def store(path):
    return PersistentProfileStore(LocalDataFile(path))


def test_round_trip(tmp_path):
    path = tmp_path / "profiles.json"
    store(path).save_profile("u1", PROFILE)
    assert store(path).get_profile("u1") == PROFILE
    assert store(path).get_profile("u2") is None


def test_missing_and_empty_file_start_empty_without_creating_it(tmp_path):
    path = tmp_path / "profiles.json"
    assert store(path).get_profile("u1") is None
    assert not path.exists()
    path.write_text("")
    assert store(path).get_profile("u1") is None


@pytest.mark.parametrize(
    "content",
    [
        '{"version": 99, "profiles": []}',
        '{"version": 1, "profiles": [{"profile": {}}]}',
        '{"version": 1, "profiles": [{"owner_id": "u1", "profile": {"cabin": 1, "display_name": "' + "x" * 81 + '"}}]}',
    ],
)
def test_corrupt_file_is_refused_and_left_untouched(tmp_path, content):
    path = tmp_path / "profiles.json"
    path.write_text(content)
    with pytest.raises(LocalDataFileError):
        store(path)
    assert path.read_text() == content


def test_reset_empties_memory_and_file(tmp_path):
    path = tmp_path / "profiles.json"
    s = store(path)
    s.save_profile("u1", PROFILE)
    s.reset()
    assert s.get_profile("u1") is None
    assert json.loads(path.read_text()) == {"version": 1, "profiles": []}
