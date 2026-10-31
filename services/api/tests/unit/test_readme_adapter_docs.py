import re
from pathlib import Path

README = (Path(__file__).parents[2] / "README.md").read_text()


def test_how_to_add_a_new_adapter_section_present():
    assert re.search(r"^#+ How to add a new adapter\s*$", README, re.M)


def test_readme_describes_one_replay_approach():
    assert README.count("HTTP client interception") >= 1
    assert not re.search(r"vcr|respx|pytest-httpx|responses library|monkeypatch the adapter", README, re.I)
