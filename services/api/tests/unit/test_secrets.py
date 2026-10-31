from botocore.exceptions import ClientError

from app import secrets
from app.secrets import get_secret


class FakeSecretsClient:
    def __init__(self, stored):
        self._stored = stored

    def get_secret_value(self, SecretId):
        if SecretId not in self._stored:
            raise ClientError({"Error": {"Code": "ResourceNotFoundException"}}, "GetSecretValue")
        return {"SecretString": self._stored[SecretId]}


class RaisingClient:
    def get_secret_value(self, SecretId):
        raise ClientError({"Error": {"Code": "AccessDeniedException"}}, "GetSecretValue")


def test_local_mode_returns_env_value():
    assert get_secret("X", local_mode=True, env={"X": "abc"}) == "abc"


def test_local_mode_unset_or_empty_is_none():
    assert get_secret("X", local_mode=True, env={}) is None
    assert get_secret("X", local_mode=True, env={"X": ""}) is None


def test_outside_local_mode_reads_secrets_manager():
    client = FakeSecretsClient({"X": "stored"})
    assert get_secret("X", local_mode=False, env={}, client=client) == "stored"


def test_outside_local_mode_never_reads_environment():
    client = FakeSecretsClient({})
    assert get_secret("X", local_mode=False, env={"X": "abc"}, client=client) is None


def test_lookup_failure_is_none():
    assert get_secret("X", local_mode=False, client=RaisingClient()) is None


def test_client_creation_failure_is_none(monkeypatch):
    def boom():
        raise RuntimeError("no credentials")

    monkeypatch.setattr(secrets, "_secrets_client", boom)
    assert get_secret("X", local_mode=False, env={}) is None
