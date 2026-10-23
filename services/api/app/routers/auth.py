import re
import secrets
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from typing import Literal

from fastapi import APIRouter, Cookie, Depends, Response
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel

from app.auth.accounts import AccountStore, DynamoAccountStore
from app.auth.cognito_identity import CognitoIdentityProvider
from app.auth.identity import (
    EmailNotConfirmed,
    EmailTaken,
    GoogleCancelled,
    IdentityError,
    IdentityProvider,
    NoAccount,
    WrongPassword,
)
from app.auth.password import validate_password
from app.auth.session import (
    SESSION_IDLE_LIMIT,
    issue_session,
    read_session,
    sign_value,
    verify_value,
)
from app.config import Settings, get_settings

router = APIRouter(prefix="/auth")

SESSION_COOKIE = "session"
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class Credentials(BaseModel):
    email: str
    password: str


class EmailOnly(BaseModel):
    email: str


@lru_cache
def _cognito() -> IdentityProvider:
    return CognitoIdentityProvider(get_settings())


@lru_cache
def _dynamo() -> AccountStore:
    return DynamoAccountStore(get_settings().accounts_table_name)


def get_identity() -> IdentityProvider:
    return _cognito()


def get_accounts() -> AccountStore:
    return _dynamo()


def get_now() -> datetime:
    return datetime.now(UTC)


def _error(status: int, code: str) -> JSONResponse:
    return JSONResponse({"code": code}, status_code=status)


def _normalise(email: str) -> str:
    return email.strip().lower()


def _set_session(response: Response, user_id: str, now: datetime, settings: Settings) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        issue_session(user_id, now),
        max_age=int(SESSION_IDLE_LIMIT.total_seconds()),
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        path="/",
    )


@router.post("/sign-up", status_code=202)
def sign_up(
    body: Credentials, identity: IdentityProvider = Depends(get_identity)
) -> Response:
    email = _normalise(body.email)
    if not validate_password(body.password):
        return _error(422, "password_rule")
    # An unusable email and an email that already has an account look the same to the caller.
    if not _EMAIL.match(email):
        return _error(400, "could_not_create")
    try:
        identity.sign_up_email(email, body.password)
    except IdentityError:
        return _error(400, "could_not_create")
    return JSONResponse({"status": "confirmation_sent"}, status_code=202)


@router.post("/sign-in")
def sign_in(
    body: Credentials,
    identity: IdentityProvider = Depends(get_identity),
    now: datetime = Depends(get_now),
    settings: Settings = Depends(get_settings),
) -> Response:
    try:
        user_id = identity.sign_in_email(_normalise(body.email), body.password)
    except WrongPassword:
        return _error(401, "wrong_password")
    except NoAccount:
        return _error(404, "no_account")
    except EmailNotConfirmed:
        return _error(403, "email_not_confirmed")
    except IdentityError:
        return _error(400, "sign_in_failed")
    response = JSONResponse({"status": "signed_in"})
    _set_session(response, user_id, now, settings)
    return response


@router.post("/sign-out", status_code=204)
def sign_out() -> Response:
    response = Response(status_code=204)
    response.delete_cookie(SESSION_COOKIE, path="/")
    return response


@router.post("/resend-confirmation", status_code=202)
def resend_confirmation(
    body: EmailOnly, identity: IdentityProvider = Depends(get_identity)
) -> Response:
    try:
        identity.resend_confirmation(_normalise(body.email))
    except IdentityError:
        pass  # same answer either way, so this cannot be used to probe for accounts
    return JSONResponse({"status": "confirmation_sent"}, status_code=202)


@router.get("/me")
def me(
    session: str | None = Cookie(default=None),
    identity: IdentityProvider = Depends(get_identity),
    accounts: AccountStore = Depends(get_accounts),
    now: datetime = Depends(get_now),
    settings: Settings = Depends(get_settings),
) -> Response:
    user_id = read_session(session, now) if session else None
    if user_id is None:
        return _error(401, "not_signed_in")
    method = "google" if accounts.is_google_linked(user_id) else "email"
    response = JSONResponse({"email": identity.email_for(user_id), "method": method})
    _set_session(response, user_id, now, settings)  # slide the 7-day idle window
    return response


class EmailChange(BaseModel):
    current_password: str
    new_email: str


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


def _account_change_guard(
    session: str | None,
    current_password: str,
    identity: IdentityProvider,
    accounts: AccountStore,
    now: datetime,
) -> tuple[str, str] | JSONResponse:
    """Return (user_id, current email) for a traveller allowed to change their sign-in details."""
    user_id = read_session(session, now) if session else None
    if user_id is None:
        return _error(401, "not_signed_in")
    if accounts.is_google_linked(user_id):
        return _error(403, "not_available")
    if not current_password:
        return _error(403, "wrong_password")
    return user_id, identity.email_for(user_id)


@router.post("/account/email", status_code=202)
def change_email(
    body: EmailChange,
    session: str | None = Cookie(default=None),
    identity: IdentityProvider = Depends(get_identity),
    accounts: AccountStore = Depends(get_accounts),
    now: datetime = Depends(get_now),
    settings: Settings = Depends(get_settings),
) -> Response:
    guard = _account_change_guard(session, body.current_password, identity, accounts, now)
    if isinstance(guard, JSONResponse):
        return guard
    user_id, email = guard
    new_email = _normalise(body.new_email)
    if not _EMAIL.match(new_email):
        return _error(422, "invalid_email")
    try:
        identity.request_email_change(email, body.current_password, new_email)
    except WrongPassword:
        return _error(403, "wrong_password")
    except EmailTaken:
        return _error(409, "email_unavailable")  # no detail: never hint at who has an account
    except IdentityError:
        return _error(400, "change_failed")
    response = JSONResponse({"status": "confirmation_sent"}, status_code=202)
    _set_session(response, user_id, now, settings)
    return response


@router.post("/account/password", status_code=204)
def change_password(
    body: PasswordChange,
    session: str | None = Cookie(default=None),
    identity: IdentityProvider = Depends(get_identity),
    accounts: AccountStore = Depends(get_accounts),
    now: datetime = Depends(get_now),
    settings: Settings = Depends(get_settings),
) -> Response:
    guard = _account_change_guard(session, body.current_password, identity, accounts, now)
    if isinstance(guard, JSONResponse):
        return guard
    user_id, email = guard
    if not validate_password(body.new_password):
        return _error(422, "password_rule")
    try:
        identity.change_password(email, body.current_password, body.new_password)
    except WrongPassword:
        return _error(403, "wrong_password")
    except IdentityError:
        return _error(400, "change_failed")
    response = Response(status_code=204)
    _set_session(response, user_id, now, settings)
    return response


GOOGLE_NONCE_COOKIE = "google_state"
GOOGLE_STATE_LIFETIME = timedelta(minutes=10)
_GOOGLE_COOKIE_PATH = "/auth/google"


@router.get("/google/start")
def google_start(
    mode: Literal["in", "up"] = "in",
    identity: IdentityProvider = Depends(get_identity),
    now: datetime = Depends(get_now),
    settings: Settings = Depends(get_settings),
) -> Response:
    # The nonce goes both in the signed state and in a cookie, so only the browser that
    # started the flow can finish it.
    nonce = secrets.token_urlsafe(16)
    state = sign_value(f"{mode}:{nonce}:{int(now.timestamp())}")
    response = RedirectResponse(identity.google_authorize_url(state), status_code=303)
    response.set_cookie(
        GOOGLE_NONCE_COOKIE,
        nonce,
        max_age=int(GOOGLE_STATE_LIFETIME.total_seconds()),
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        path=_GOOGLE_COOKIE_PATH,
    )
    return response


def _read_google_state(
    state: str, nonce_cookie: str | None, now: datetime
) -> Literal["in", "up"] | None:
    verified = verify_value(state)
    if verified is None or not nonce_cookie:
        return None
    try:
        mode, nonce, issued_at = verified.split(":")
        age = now - datetime.fromtimestamp(int(issued_at), UTC)
    except ValueError:
        return None
    if mode not in ("in", "up") or age >= GOOGLE_STATE_LIFETIME or age < timedelta(0):
        return None
    if not secrets.compare_digest(nonce.encode(), nonce_cookie.encode()):
        return None
    return mode


@router.get("/google/callback")
def google_callback(
    state: str = "",
    code: str | None = None,
    error: str | None = None,
    google_state: str | None = Cookie(default=None),
    identity: IdentityProvider = Depends(get_identity),
    accounts: AccountStore = Depends(get_accounts),
    now: datetime = Depends(get_now),
    settings: Settings = Depends(get_settings),
) -> Response:
    def back(path: str) -> RedirectResponse:
        response = RedirectResponse(f"{settings.web_origin}{path}", status_code=303)
        response.delete_cookie(GOOGLE_NONCE_COOKIE, path=_GOOGLE_COOKIE_PATH)  # single use
        return response

    mode = _read_google_state(state, google_state, now)
    if mode is None:
        return back("/sign-in")
    cancelled = "/sign-in?error=google_cancelled" if mode == "in" else "/sign-up"
    if error or not code:
        return back(cancelled)
    try:
        user_id = identity.complete_google(code)
    except GoogleCancelled:
        return back(cancelled)
    except IdentityError:
        return back("/sign-in")  # a failed exchange is not a cancellation
    if mode == "up":
        accounts.link_google(user_id)
    elif not accounts.is_google_linked(user_id):
        return back("/sign-in?error=google_not_linked")
    response = back("/")
    _set_session(response, user_id, now, settings)
    return response
