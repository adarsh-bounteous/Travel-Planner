import hashlib
import hmac
import secrets
import sqlite3
from collections.abc import Callable
from contextlib import closing
from datetime import datetime, timedelta
from typing import Literal
from pathlib import Path
from urllib.parse import urlencode
from uuid import uuid4

from app.auth.identity import (
    EmailNotConfirmed,
    EmailTaken,
    GoogleCancelled,
    LinkAlreadyUsed,
    LinkExpired,
    LinkInvalid,
    NoAccount,
    WrongPassword,
)

CONFIRMATION_LINK_LIFETIME = timedelta(hours=24)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    confirmed INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS confirmation_tokens (
    token TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    user_id TEXT,
    new_email TEXT
);
"""


def _hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return f"{salt.hex()}:{digest.hex()}"


def _password_matches(password: str, stored: str) -> bool:
    salt, digest = stored.split(":")
    candidate = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=2**14, r=8, p=1)
    return hmac.compare_digest(candidate, bytes.fromhex(digest))


class LocalIdentityProvider:
    """Local mode's IdentityProvider: accounts in a SQLite file, so they survive an API restart.

    Confirmation links are delivered through `send_confirmation` (the local inbox). Google codes
    become users named `google-<code>`, as in FakeIdentityProvider.
    """

    def __init__(
        self,
        db_path: Path,
        clock: Callable[[], datetime],
        send_confirmation: Callable[[str, str], None],
        link_base: Callable[[], str],
        send_email_change: Callable[[str, str], None] | None = None,
    ) -> None:
        self._path = db_path
        self._clock = clock
        self._send_confirmation = send_confirmation
        self._link_base = link_base
        self._send_email_change = send_email_change or send_confirmation
        db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._db() as db:
            db.executescript(_SCHEMA)
            # An accounts file from before email change lacks these columns.
            have = {row["name"] for row in db.execute("PRAGMA table_info(confirmation_tokens)")}
            for column in ("user_id", "new_email"):
                if column not in have:
                    db.execute(f"ALTER TABLE confirmation_tokens ADD COLUMN {column} TEXT")

    def _db(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self._path)
        connection.row_factory = sqlite3.Row
        return connection

    def _run(self, sql: str, *args: object) -> list[sqlite3.Row]:
        with closing(self._db()) as db, db:
            return db.execute(sql, args).fetchall()

    def _issue_link(self, email: str) -> None:
        token = secrets.token_urlsafe(32)
        expires_at = self._clock() + CONFIRMATION_LINK_LIFETIME
        self._run(
            "INSERT INTO confirmation_tokens (token, email, expires_at) VALUES (?, ?, ?)",
            token,
            email,
            expires_at.isoformat(),
        )
        self._send_confirmation(email, f"{self._link_base()}/confirm-email/{token}")

    def reset(self) -> None:
        self._run("DELETE FROM users")
        self._run("DELETE FROM confirmation_tokens")

    def account_exists(self, email: str) -> bool:
        return bool(self._run("SELECT 1 FROM users WHERE email = ?", email.lower()))

    def is_empty(self) -> bool:
        return not self._run("SELECT 1 FROM users LIMIT 1")

    def user_id_for(self, email: str) -> str:
        return self._run("SELECT user_id FROM users WHERE email = ?", email.lower())[0]["user_id"]

    def _insert_user(self, email: str, password: str, confirmed: int) -> str:
        user_id = f"user-{uuid4().hex}"
        try:
            self._run(
                "INSERT INTO users (user_id, email, password_hash, confirmed) VALUES (?, ?, ?, ?)",
                user_id,
                email.lower(),
                _hash_password(password),
                confirmed,
            )
        except sqlite3.IntegrityError as error:
            raise EmailTaken from error
        return user_id

    def create_confirmed_user(self, email: str, password: str) -> str:
        return self._insert_user(email, password, 1)

    def sign_up_email(self, email: str, password: str) -> None:
        email = email.lower()
        if self.account_exists(email):
            raise EmailTaken
        self._insert_user(email, password, 0)
        self._issue_link(email)

    def confirm_email(self, token: str) -> Literal["sign_up", "email_change"]:
        """Open a link: confirms a sign-up, or moves the account to the new email of a change."""
        with closing(self._db()) as db, db:
            row = db.execute(
                "SELECT email, expires_at, used_at, user_id, new_email"
                " FROM confirmation_tokens WHERE token = ?",
                (token,),
            ).fetchone()
            if row is None:
                raise LinkInvalid
            if row["used_at"] is not None:
                raise LinkAlreadyUsed
            now = self._clock()
            if now > datetime.fromisoformat(row["expires_at"]):
                raise LinkExpired
            if row["new_email"] is None:
                db.execute(
                    "UPDATE confirmation_tokens SET used_at = ? WHERE token = ?", (now.isoformat(), token)
                )
                db.execute("UPDATE users SET confirmed = 1 WHERE email = ?", (row["email"],))
                return "sign_up"
            if db.execute("SELECT 1 FROM users WHERE email = ?", (row["new_email"],)).fetchone():
                raise EmailTaken
            db.execute(
                "UPDATE confirmation_tokens SET used_at = ? WHERE token = ?", (now.isoformat(), token)
            )
            db.execute(
                "UPDATE users SET email = ? WHERE user_id = ?", (row["new_email"], row["user_id"])
            )
            return "email_change"

    def sign_in_email(self, email: str, password: str) -> str:
        rows = self._run(
            "SELECT user_id, password_hash, confirmed FROM users WHERE email = ?", email.lower()
        )
        if not rows:
            raise NoAccount
        user = rows[0]
        if not _password_matches(password, user["password_hash"]):
            raise WrongPassword
        if not user["confirmed"]:
            raise EmailNotConfirmed
        return user["user_id"]

    def resend_confirmation(self, email: str) -> None:
        rows = self._run("SELECT confirmed FROM users WHERE email = ?", email.lower())
        if rows and not rows[0]["confirmed"]:
            self._issue_link(email.lower())

    def email_for(self, user_id: str) -> str:
        rows = self._run("SELECT email FROM users WHERE user_id = ?", user_id)
        return rows[0]["email"] if rows else f"{user_id}@google.example"

    def request_email_change(self, email: str, current_password: str, new_email: str) -> None:
        self.check_password(email, current_password)
        new_email = new_email.lower()
        if self.account_exists(new_email):
            raise EmailTaken
        user_id = self.user_id_for(email)
        # Only the newest link works: retire any earlier unused change link for this account.
        now = self._clock().isoformat()
        self._run(
            "UPDATE confirmation_tokens SET used_at = ?"
            " WHERE user_id = ? AND new_email IS NOT NULL AND used_at IS NULL",
            now,
            user_id,
        )
        token = secrets.token_urlsafe(32)
        self._run(
            "INSERT INTO confirmation_tokens (token, email, expires_at, user_id, new_email)"
            " VALUES (?, ?, ?, ?, ?)",
            token,
            email.lower(),
            (self._clock() + CONFIRMATION_LINK_LIFETIME).isoformat(),
            user_id,
            new_email,
        )
        self._send_email_change(new_email, f"{self._link_base()}/confirm-email/{token}")

    def change_password(self, email: str, current_password: str, new_password: str) -> None:
        self.check_password(email, current_password)
        self._run(
            "UPDATE users SET password_hash = ? WHERE email = ?",
            _hash_password(new_password),
            email.lower(),
        )

    def check_password(self, email: str, password: str) -> None:
        """Raise WrongPassword unless `password` is the account's, whether confirmed or not."""
        rows = self._run("SELECT password_hash FROM users WHERE email = ?", email.lower())
        if not rows or not _password_matches(password, rows[0]["password_hash"]):
            raise WrongPassword

    def google_authorize_url(self, state: str) -> str:
        return f"{self._link_base()}/local/google-consent?" + urlencode({"state": state})

    def complete_google(self, code: str) -> str:
        """`code` is the email chosen on the local consent page: its account, else an unlinked identity."""
        if code == "cancelled":
            raise GoogleCancelled
        # An unconfirmed account stays an unlinked identity, so Google cannot skip email confirmation.
        rows = self._run("SELECT user_id FROM users WHERE email = ? AND confirmed = 1", code.lower())
        return rows[0]["user_id"] if rows else f"google-{code}"

    def user_exists(self, user_id: str) -> bool:
        return bool(self._run("SELECT 1 FROM users WHERE user_id = ? AND confirmed = 1", user_id))

    def known_emails(self) -> list[str]:
        """Confirmed accounts' emails: the ones Google sign-in can use."""
        return [
            row["email"] for row in self._run("SELECT email FROM users WHERE confirmed = 1 ORDER BY email")
        ]
