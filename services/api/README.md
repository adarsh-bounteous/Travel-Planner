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
| `COOKIE_SECURE` | `true` | Set `false` only for local http development. |

Sessions are HttpOnly cookies that are re-issued on every authenticated request, so they
expire after 7 days without use. No email or password is logged.
