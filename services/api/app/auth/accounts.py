from typing import Protocol


class AccountStore(Protocol):
    """Account-link records in the Trip Database: which identities may sign in with Google."""

    def link_google(self, user_id: str) -> None: ...

    def is_google_linked(self, user_id: str) -> bool: ...


class InMemoryAccountStore:
    def __init__(self) -> None:
        self._google: set[str] = set()

    def reset(self) -> None:
        self._google.clear()

    def link_google(self, user_id: str) -> None:
        self._google.add(user_id)

    def is_google_linked(self, user_id: str) -> bool:
        return user_id in self._google


class DynamoAccountStore:
    def __init__(self, table_name: str) -> None:
        import boto3

        self._table = boto3.resource("dynamodb").Table(table_name)

    @staticmethod
    def _key(user_id: str) -> dict[str, str]:
        return {"pk": f"USER#{user_id}"}

    def link_google(self, user_id: str) -> None:
        self._table.update_item(
            Key=self._key(user_id),
            UpdateExpression="SET google_linked = :t",
            ExpressionAttributeValues={":t": True},
        )

    def is_google_linked(self, user_id: str) -> bool:
        item = self._table.get_item(Key=self._key(user_id)).get("Item", {})
        return bool(item.get("google_linked"))
