# Local setup

Run the whole app on your machine with no cloud account. Local mode swaps the cloud dependencies
for local stand-ins, listed below.

## Setup steps

On a clean checkout you need Node 22, pnpm and Python 3.12. From the repository root:

    pnpm start

This starts the API on port 8000 and the Web App on port 5173, already wired together. On the first
run it installs the web dependencies and creates `services/api/.venv`. Open
<http://localhost:5173> and sign in with the demo account below. Set `API_PORT` or `WEB_PORT` to
use other ports. If a port is busy, nothing starts and the command names the busy port.

## Demo sign-in

| Field | Value |
| --- | --- |
| Email | `demo@example.com` |
| Password | `demo-password-1` |

The account is already confirmed, so no sign-up is needed. After signing in you see two sample
trips: "Weekend in Lisbon" and "Summer in Kyoto". The password is for local use only.

## Reset

Accounts are kept in a file under `LOCAL_DATA_DIR` (default `services/api/.local-data`), so they
survive a restart. Trips are kept in `store.json` in the same directory, and they survive a restart
too. The local inbox stays in memory. To clear the trips, stop `pnpm start` with Ctrl+C, delete or
empty `services/api/.local-data/store.json`, and run it again:

    pnpm start

The sample trips are seeded again. If `store.json` is unreadable or corrupted, the API stops at
startup with an error naming the file and does not start until you delete or empty it. Traveller
profiles and their preferences are kept the same way in `profiles.json` beside `store.json`; delete or
empty it to start with blank profiles (an unreadable `profiles.json` also stops startup). Accounts you created stay until you open Menu in the web app and
choose Reset local data (shown only while local sign-in is on), which clears accounts, trips and the
inbox and restores the demo account and sample trips, or you delete the `LOCAL_DATA_DIR` directory
while the API is stopped.

## What is faked

| Cloud dependency | What it replaces | How it is faked locally |
| --- | --- | --- |
| Identity Provider | Cognito | `LocalIdentityProvider` keeps accounts and confirmation links in a local file, so sign-in works with no cloud identity service; the account links sit in `InMemoryAccountStore`. |
| Trip Database | DynamoDB trips | `PersistentTripStore` holds Trips in memory and keeps them in `store.json` in the local data directory; `PersistentProfileStore` does the same for traveller profiles in `profiles.json`. |
| Email Delivery | SES | `InMemoryInviteSender` keeps each email in memory and shows it on the local inbox page (see below). |
| Maps and Places | Places search | `InMemoryPlaceSearch` searches a seed catalogue. |
| Flight and Hotel Search | Flight and stay providers | `InMemoryFlightProvider` and `InMemoryStayProvider` answer from seed catalogues. |
| Transport options | Train, bus and taxi providers | `InMemoryTransportProvider` answers from seed catalogues. |
| Recommendations | Recommendation source | `InMemoryRecommendations` serves recommendations generated locally from the trip's destination and interests when local mode is on; the seeded source otherwise. |
| Currency rates | Rate source | `InMemoryRates` serves seed rates. |

Not faked yet: the traveller profile and saved places still use `DynamoProfileStore` and
`DynamoSavedPlaceStore` in local mode, so those pages may fail without AWS access.

## Email delivery and the local inbox

Every email the app would send, such as an editor invite, is saved to a local inbox instead of
being sent. No email leaves your machine. With `pnpm start` running, the local inbox is at:

    http://localhost:5173/local/inbox

Signing up sends a confirmation email to the inbox. Open its link (`/confirm-email/<token>`) to
confirm the account, then sign in. A link works once and expires after 24 hours. Confirmation links
are for accounts created in local mode; the demo account is already confirmed.

If you set `WEB_PORT`, use that port instead of 5173. The inbox is empty after every start, and it
returns "not found" when local mode is off.

## Availability gate (ADR-0005)

Monthly availability must be at least 99.9%, taken as at most 43 minutes of downtime. A month with
more downtime is reported as breached with its downtime budget exhausted, and both raise an alert to
on-call. `GET /availability` shows the current month's figure, including downtime up to now. Local
mode has an empty in-memory probe history, so no table is needed.

The scheduled handler is `app.availability.runner.handler`. These resources are provisioned outside
this repo:

| Setting | Purpose |
|---|---|
| `AVAILABILITY_TABLE_NAME` | DynamoDB probe history, partition key `month` (string), sort key `at` (string). Default `trip-planner-availability`. |
| `ONCALL_ALERT_TOPIC_ARN` | SNS topic the on-call team subscribes to. Required by the month-end gate. |
| `PUBLIC_HEALTH_URL` | Public URL of `/health`. When empty, every probe counts as down. |

Two EventBridge schedules invoke the handler:

- `{"task": "probe"}` every minute.
- `{"task": "month_end_gate"}` at 00:05 UTC on day 1, which evaluates the month that just ended.

A failed probe counts as downtime until the next probe. Gaps with no probes count as unmeasured.
