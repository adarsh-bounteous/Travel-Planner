import os
from collections.abc import Mapping
from typing import Any


def _secrets_client() -> Any:
    import boto3

    return boto3.client("secretsmanager")


def get_secret(
    name: str,
    *,
    local_mode: bool,
    env: Mapping[str, str] = os.environ,
    client: Any = None,
) -> str | None:
    """A provider's key: the environment in local mode, AWS Secrets Manager otherwise.

    None means "not configured". Outside local mode the environment is never read, and any
    lookup failure is None, so a missing or unreachable key never stops the app starting.
    """
    if local_mode:
        return env.get(name) or None
    try:
        secrets = client if client is not None else _secrets_client()
        return secrets.get_secret_value(SecretId=name).get("SecretString") or None
    except Exception:
        return None
