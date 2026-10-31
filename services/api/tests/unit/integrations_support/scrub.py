import json
import re
from collections.abc import Iterable

REDACTED = "[scrubbed]"

PERSONAL_FIELDS = frozenset({
    "name", "first_name", "last_name", "email", "phone", "address", "postal_address",
    "street", "city", "postcode", "zip", "dob", "date_of_birth", "birthdate",
})

_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
_PHONE = re.compile(r"\+?\d[\d\s().-]{6,}\d")


def _clean_text(text: str) -> str:
    return _PHONE.sub(REDACTED, _EMAIL.sub(REDACTED, text))


def _walk(value, personal: frozenset[str]):
    if isinstance(value, dict):
        return {
            key: REDACTED if key.lower() in personal else _walk(item, personal)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [_walk(item, personal) for item in value]
    if isinstance(value, str):
        return _clean_text(value)
    return value


def _redact_secrets(text: str, secrets: Iterable[str]) -> str:
    for secret in sorted({s for s in secrets if s}, key=len, reverse=True):
        text = text.replace(secret, REDACTED)
    return text


def scrub_body(body: bytes, *, secrets: Iterable[str]) -> bytes:
    """Remove personal data and secrets from a response body before it is stored."""
    secrets = list(secrets)
    text = body.decode("utf-8", errors="replace")
    try:
        parsed = json.loads(text)
    except ValueError:
        return _redact_secrets(_clean_text(_redact_secrets(text, secrets)), secrets).encode()
    # Secrets go first so a key is removed even when it looks like a phone number.
    text = json.dumps(_walk(json.loads(_redact_secrets(json.dumps(parsed), secrets)), PERSONAL_FIELDS))
    return _redact_secrets(text, secrets).encode()
