import pytest

from tests.unit.store_contract.mutants import MUTANTS


@pytest.mark.parametrize("rule, mutant", MUTANTS, ids=[rule.__name__ for rule, _ in MUTANTS])
def test_a_local_only_difference_fails_its_rule(rule, mutant, tmp_path):
    with pytest.raises(AssertionError):
        rule(mutant(tmp_path))
