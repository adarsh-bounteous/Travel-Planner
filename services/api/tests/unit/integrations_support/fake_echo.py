from dataclasses import dataclass

from app.integrations import IntegrationClient, ProviderSettings

SETTINGS = ProviderSettings(name="fake-echo", base_url="http://fake-echo.test")


@dataclass(frozen=True)
class EchoResult:
    message: str


class FakeEchoProvider:
    """Test-only adapter: it only maps data; the shared client does the rest."""

    def __init__(self, client: IntegrationClient) -> None:
        self._client = client

    def echo(self, message: str) -> EchoResult:
        response = self._client.request("fake-echo", "POST", "/echo", json={"message": message})
        return EchoResult(message=response.json()["message"])
