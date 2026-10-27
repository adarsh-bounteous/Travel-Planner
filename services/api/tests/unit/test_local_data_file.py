import pytest

from app.local_data import LocalDataFile, LocalDataFileError


def test_missing_empty_and_blank_files_read_as_empty(tmp_path):
    assert LocalDataFile(tmp_path / "missing.json").read() == {}
    (tmp_path / "empty.json").write_bytes(b"")
    assert LocalDataFile(tmp_path / "empty.json").read() == {}
    (tmp_path / "blank.json").write_text(" \n ")
    assert LocalDataFile(tmp_path / "blank.json").read() == {}


def test_write_creates_the_directory_and_reads_back(tmp_path):
    file = LocalDataFile(tmp_path / "nested" / "store.json")
    file.write({"version": 1})
    assert file.read() == {"version": 1}
    assert [p.name for p in (tmp_path / "nested").iterdir()] == ["store.json"]


@pytest.mark.parametrize("content", [b"{not json", b"[]", b"\xff\xfe"])
def test_bad_content_raises_with_the_path(tmp_path, content):
    path = tmp_path / "store.json"
    path.write_bytes(content)
    with pytest.raises(LocalDataFileError, match="unreadable or corrupted") as error:
        LocalDataFile(path).read()
    assert str(path) in str(error.value)
    assert path.read_bytes() == content


def test_a_directory_is_unreadable(tmp_path):
    with pytest.raises(LocalDataFileError, match="unreadable or corrupted"):
        LocalDataFile(tmp_path).read()
