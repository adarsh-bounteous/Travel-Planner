"""Run one list of contract rules against every adapter of a port."""
import inspect
from collections.abc import Callable, Mapping, Sequence

import pytest


def collect_rules(*modules) -> list[Callable]:
    rules = [
        func
        for module in modules
        for name, func in inspect.getmembers(module, inspect.isfunction)
        if name.startswith("rule_") and func.__module__ == module.__name__
    ]
    return sorted(rules, key=lambda rule: rule.__name__)


def contract_params(adapters: Mapping[str, Callable]) -> list:
    return [pytest.param(factory, id=name) for name, factory in adapters.items()]


def run_contract(port: str, adapters: Mapping[str, Callable], rules: Sequence[Callable]) -> None:
    failures = []
    for name, factory in adapters.items():
        for rule in rules:
            try:
                rule(factory())
            except AssertionError as error:
                failures.append(f"adapter '{name}' broke {rule.__name__}: {error}")
    if failures:
        raise AssertionError(f"{port} contract failed:\n" + "\n".join(failures))
