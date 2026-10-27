import pytest

from tests.unit.store_contract.stores import cloud_tables_present, make_store


@pytest.fixture(
    params=[pytest.param("local"), pytest.param("cloud", marks=pytest.mark.cloud_store)]
)
def store(request, tmp_path):
    if request.param == "cloud" and not cloud_tables_present():
        pytest.skip("cloud tables absent")
    bundle = make_store(request.param, tmp_path)
    yield bundle
    bundle.cleanup()
