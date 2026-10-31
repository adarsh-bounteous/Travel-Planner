from dataclasses import dataclass

import pytest

from tests.unit.contract_kit import collect_rules, contract_params, run_contract
from tests.unit.store_contract import (
    rules_accounts,
    rules_invites,
    rules_profiles,
    rules_saved_places,
    rules_share_links,
    rules_trips,
)
from tests.unit.store_contract.mutants import MUTANTS
from tests.unit.store_contract.stores import STORE_RULES, make_store, store_adapters

MODULES = (rules_trips, rules_invites, rules_share_links, rules_accounts, rules_profiles, rules_saved_places)


@dataclass
class Adapter:
    name: str


def test_every_adapter_gets_the_same_rules():
    seen = {}
    rules = [lambda a: seen.setdefault(a.name, []).append("r1"), lambda a: seen[a.name].append("r2")]
    run_contract("demo", {"a": lambda: Adapter("a"), "b": lambda: Adapter("b")}, rules)
    assert seen == {"a": ["r1", "r2"], "b": ["r1", "r2"]}


def test_failure_names_the_adapter(tmp_path):
    rule = rules_saved_places.rule_saving_twice_keeps_one_entry
    mutant = dict(MUTANTS)[rule]
    with pytest.raises(AssertionError, match=r"adapter 'broken'.*rule_saving_twice_keeps_one_entry"):
        run_contract("store", {"broken": lambda: mutant(tmp_path)}, [rule])


def test_contract_params_use_adapter_names():
    assert [p.id for p in contract_params({"a": object, "b": object})] == ["a", "b"]


def test_store_contract_checks_are_exactly_the_existing_rules():
    existing = {f for m in MODULES for n, f in vars(m).items() if n.startswith("rule_")}
    assert set(STORE_RULES) == existing and len(STORE_RULES) == len(existing)
    assert collect_rules(*MODULES) == STORE_RULES


def test_local_store_passes_the_store_contract(tmp_path):
    run_contract("store", {"local": store_adapters(tmp_path)["local"]}, STORE_RULES)
    assert "local" in store_adapters(tmp_path)
