import pytest
from botocore.exceptions import ClientError, EndpointConnectionError, NoCredentialsError, NoRegionError

from tests.unit.store_contract.stores import cloud_tables_present

pytest_plugins = ["pytester"]


class FakeDynamoClient:
    def __init__(self, tables):
        self.tables = tables

    def describe_table(self, TableName):
        if TableName not in self.tables:
            raise ClientError({"Error": {"Code": "ResourceNotFoundException"}}, "DescribeTable")


def test_absent_tables_are_reported_absent():
    assert cloud_tables_present(lambda: FakeDynamoClient(set())) is False


def test_one_missing_table_is_reported_absent():
    assert cloud_tables_present(lambda: FakeDynamoClient({"trip-planner-trips"})) is False


@pytest.mark.parametrize(
    "error", [NoCredentialsError(), NoRegionError(), EndpointConnectionError(endpoint_url="http://x")]
)
def test_an_unreachable_cloud_is_reported_absent(error):
    def unreachable():
        raise error

    assert cloud_tables_present(unreachable) is False


def test_present_tables_are_reported_present():
    tables = {"trip-planner-trips", "trip-planner-accounts"}
    assert cloud_tables_present(lambda: FakeDynamoClient(tables)) is True


CONFTEST = """
import pytest
from tests.unit.store_contract import stores
from tests.unit.store_contract.stores import make_store

PRESENT = {present}

@pytest.fixture(params=[pytest.param("local"), pytest.param("cloud", marks=pytest.mark.cloud_store)])
def store(request, tmp_path):
    if request.param == "cloud" and not PRESENT:
        pytest.skip("cloud tables absent")
    yield make_store("local", tmp_path)  # a stub stands in for the real tables
"""


def run_with(pytester, present: bool):
    pytester.makeini("[pytest]\nmarkers =\n    cloud_store: x\n")
    pytester.makeconftest(CONFTEST.format(present=present))
    pytester.makepyfile(
        "def test_rule(store):\n    assert store.new_id()\n"
    )
    return pytester.runpytest("-rs")


def test_absent_tables_skip_the_cloud_run(pytester):
    result = run_with(pytester, present=False)
    result.assert_outcomes(passed=1, skipped=1)
    result.stdout.fnmatch_lines(["*cloud tables absent*"])


def test_present_tables_run_the_cloud_run(pytester):
    result = run_with(pytester, present=True)
    result.assert_outcomes(passed=2, skipped=0)
