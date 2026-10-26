# Trip Planner API

FastAPI service. Python 3.12.

    pip install -r requirements.txt
    uvicorn app.main:app --reload
    sh run-py.sh -m pytest -c pytest.ini        # unit
    sh run-py.sh -m pytest -c pytest-e2e.ini    # e2e
    sh build.sh

## Settings (environment)

| Variable | Default | Purpose |
| --- | --- | --- |
| `SESSION_SECRET` | none, required | Signs session cookies. The app refuses to start without it. |
| `IDENTITY_USER_POOL_ID` | empty | Cognito user pool (Identity Provider, ADR-0009). |
| `IDENTITY_CLIENT_ID` | empty | Cognito app client id. |
| `IDENTITY_DOMAIN` | empty | Cognito hosted domain used for the Google redirect and token exchange. |
| `GOOGLE_REDIRECT_URI` | empty | The API's `/auth/google/callback` URL registered with the pool. |
| `WEB_ORIGIN` | empty (same origin) | Web App origin the API redirects back to. |
| `ACCOUNTS_TABLE_NAME` | `trip-planner-accounts` | DynamoDB table holding account-link records (`pk = USER#<id>`). |
| `TRIPS_TABLE_NAME` | `trip-planner-trips` | DynamoDB table holding Trips (`pk = USER#<owner id>`, `sk = TRIP#<trip id>`, both strings). Provisioned outside this repo; also holds editor-invite index items (`INVITE#<token>`, `EDITOR#<email>`); needs `GetItem`, `PutItem`, `Query`, `DeleteItem`. |
| `INVITE_FROM_ADDRESS` | _(empty)_ | Verified SES sender for editor invite emails (needs `ses:SendEmail`). When empty nothing is sent and the owner copies the invite link from the Travelers tab. |
| `COOKIE_SECURE` | `true` | Set `false` only for local http development. |
| `LOCAL_MODE` | off | The one switch every local stand-in follows. Accepts `true`/`on`/`1`/`yes` or `false`/`off`/`0`; any other value is refused. |
| `APP_ENV` | `production` | Environment name. Local mode is only allowed when this is exactly `local`. |

## Local mode

Local mode is off unless `LOCAL_MODE` is set, so an unconfigured app behaves like production.
To use it, set `LOCAL_MODE=true` and `APP_ENV=local`. If local mode is on in any other
environment, the app refuses to start: set `LOCAL_MODE` to off, or run in the local environment.
`GET /startup-status` reports whether local mode is on and which stand-ins
(storage, sign-in, cloud services) are enabled.

### Demo account and sample trips

In local mode sign-in, accounts and trips are kept in memory, so every local start begins with
empty data. On the first local start, when local data is completely empty (no accounts and no trips), the
API seeds one confirmed demo account and two sample trips ("Weekend in Lisbon" and "Summer in
Kyoto", dated from the day of the start). Sign in with `demo@example.com` and `demo-password-1`;
no sign-up is needed. Fresh sign-up still works. The demo password is for local use only.

Seeding runs only when local data is empty, and it never updates anything, so a restart adds no
second demo account or trips and keeps your edits. If other data exists but the demo account or
its trips are missing, nothing is added. A crash part-way through seeding is not repaired. For a
fresh first start, clear the local data. In local mode `GET /startup-status` also returns
`demo_account` (email and password) once the demo account exists, so the sign-in page can offer
it. It is `null` whenever local mode is off.

Sessions are HttpOnly cookies that are re-issued on every authenticated request, so they
expire after 7 days without use. No email or password is logged.

Trips and the traveller profile belong to the signed-in traveller: the owner is always the
session's user id, never taken from the path or body, and another traveller's trip answers 404.
The profile is stored as a `profile` map on the account item. It also holds the answers New trip
set-up collects (citizenship, residence, health status, religion, diet, tastes, travel style);
all default to empty, so older stored profiles still read. Trip and profile contents are
personal data and are not logged.
