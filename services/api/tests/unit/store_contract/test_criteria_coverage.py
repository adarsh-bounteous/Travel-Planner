import importlib
from pathlib import Path

import pytest

from tests.unit.store_contract.criteria import CRITERIA

AREAS = {"trips", "invites", "share_links", "accounts", "profiles", "saved_places"}


def contract_modules() -> list[str]:
    return sorted(p.stem for p in Path(__file__).parent.glob("test_*_contract.py"))


def shared_test_names() -> set[str]:
    names: set[str] = set()
    for module in contract_modules():
        loaded = importlib.import_module(f"tests.unit.store_contract.{module}")
        names |= {n for n in vars(loaded) if n.startswith("test_")}
    return names


def test_every_area_has_shared_tests():
    assert AREAS <= {m.removeprefix("test_").removesuffix("_contract") for m in contract_modules()}


@pytest.mark.parametrize("key, test_id", CRITERIA.items())
def test_criterion_has_a_shared_case(key, test_id):
    assert test_id in shared_test_names(), key


def test_every_story_068_to_072_is_covered():
    assert {s for s, _ in CRITERIA} == {"068", "069", "070", "071", "072"}
