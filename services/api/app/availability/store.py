from datetime import datetime
from typing import Protocol

from app.availability.gate import ProbeResult


def month_of(at: datetime) -> str:
    return at.strftime("%Y-%m")


class ProbeStore(Protocol):
    def record(self, result: ProbeResult) -> None: ...

    def for_month(self, month: str) -> list[ProbeResult]: ...


class InMemoryProbeStore:
    def __init__(self) -> None:
        self._results: list[ProbeResult] = []

    def record(self, result: ProbeResult) -> None:
        self._results.append(result)

    def for_month(self, month: str) -> list[ProbeResult]:
        return [r for r in self._results if month_of(r.at) == month]


class DynamoProbeStore:
    """Probe history in DynamoDB: partition key `month`, sort key `at` (ISO-8601, UTC)."""

    def __init__(self, table_name: str) -> None:
        import boto3

        self._table = boto3.resource("dynamodb").Table(table_name)

    def record(self, result: ProbeResult) -> None:
        self._table.put_item(Item={"month": month_of(result.at), "at": result.at.isoformat(), "ok": result.ok})

    def for_month(self, month: str) -> list[ProbeResult]:
        from boto3.dynamodb.conditions import Key

        results: list[ProbeResult] = []
        kwargs: dict = {"KeyConditionExpression": Key("month").eq(month)}
        while True:
            page = self._table.query(**kwargs)
            results += [ProbeResult(datetime.fromisoformat(i["at"]), bool(i["ok"])) for i in page["Items"]]
            if "LastEvaluatedKey" not in page:
                return results
            kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]
