import base64
import hashlib
import hmac
import json
from datetime import UTC, datetime, timedelta

from app.config import session_secret

SESSION_IDLE_LIMIT = timedelta(days=7)


def _sign(payload: str) -> str:
    return hmac.new(session_secret(), payload.encode(), hashlib.sha256).hexdigest()


def sign_value(value: str) -> str:
    """Sign an arbitrary short string (used for the Google `state` value)."""
    payload = base64.urlsafe_b64encode(value.encode()).decode()
    return f"{payload}.{_sign(payload)}"


def verify_value(token: str) -> str | None:
    payload, _, sig = token.rpartition(".")
    if not payload or not hmac.compare_digest(sig.encode(), _sign(payload).encode()):
        return None
    try:
        return base64.urlsafe_b64decode(payload.encode()).decode()
    except ValueError:
        return None


def issue_session(user_id: str, now: datetime) -> str:
    return sign_value(json.dumps({"u": user_id, "t": now.timestamp()}))


def read_session(token: str, now: datetime) -> str | None:
    raw = verify_value(token)
    if raw is None:
        return None
    try:
        data = json.loads(raw)
        last_active = datetime.fromtimestamp(data["t"], UTC)
        user_id = data["u"]
    except (ValueError, KeyError, TypeError):
        return None
    if now - last_active >= SESSION_IDLE_LIMIT:
        return None
    return user_id
