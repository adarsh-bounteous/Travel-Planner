import json
import re
from collections.abc import Iterable

REDACTED = "[scrubbed]"

PERSONAL_FIELDS = frozenset({
    "name", "first_name", "last_name", "email", "phone", "address", "postal_address",
    "street", "city", "postcode", "zip", "dob", "date_of_birth", "birthdate", "website",
})
PERSONAL_PREFIXES = ("addr:", "contact:")
# Positions and ids, not people: kept readable even though a phone pattern would match them.
GEO_FIELDS = frozenset({"lat", "lon", "boundingbox", "place_id", "osm_id", "importance"})
# Kept inside a redacted object so the response keeps its shape (Nominatim's `address`).
KEPT_LEAVES = frozenset({"country_code"})

_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
_PHONE = re.compile(r"\+?\d[\d\s().-]{6,}\d")


def _clean_text(text: str) -> str:
    return _PHONE.sub(REDACTED, _EMAIL.sub(REDACTED, text))


def _is_personal(key: str) -> bool:
    key = key.lower()
    return key in PERSONAL_FIELDS or key.startswith(PERSONAL_PREFIXES)


def _walk(value, *, redact: bool = False, geo: bool = False, key: str = ""):
    """`redact`: leaf strings are personal data; `geo`: numeric strings that are not phone numbers."""
    if isinstance(value, dict):
        return {
            k: _walk(
                item,
                redact=redact or _is_personal(k),
                geo=geo or k.lower() in GEO_FIELDS,
                key=k.lower(),
            )
            for k, item in value.items()
        }
    if isinstance(value, list):
        return [_walk(item, redact=redact, geo=geo, key=key) for item in value]
    if isinstance(value, str):
        if key in KEPT_LEAVES or (geo and not redact):
            return _EMAIL.sub(REDACTED, value)
        return REDACTED if redact else _clean_text(value)
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
    text = json.dumps(_walk(json.loads(_redact_secrets(json.dumps(parsed), secrets))))
    return _redact_secrets(text, secrets).encode()
