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
survive a restart. Trips and the local inbox stay in memory. To clear the trips and inbox, stop
`pnpm start` with Ctrl+C and run it again:

    pnpm start

The sample trips are seeded again. Accounts you created stay until you open Menu in the web app and
choose Reset local data (shown only while local sign-in is on), which clears accounts, trips and the
inbox and restores the demo account and sample trips, or you delete the `LOCAL_DATA_DIR` directory
while the API is stopped.

## What is faked

| Cloud dependency | What it replaces | How it is faked locally |
| --- | --- | --- |
| Identity Provider | Cognito | `LocalIdentityProvider` keeps accounts and confirmation links in a local file, so sign-in works with no cloud identity service; the account links sit in `InMemoryAccountStore`. |
| Trip Database | DynamoDB trips | `InMemoryTripStore` holds Trips in memory. |
| Email Delivery | SES | `InMemoryInviteSender` keeps each email in memory and shows it on the local inbox page (see below). |
| Maps and Places | Places search | `InMemoryPlaceSearch` searches a seed catalogue. |
| Flight and Hotel Search | Flight and stay providers | `InMemoryFlightProvider` and `InMemoryStayProvider` answer from seed catalogues. |
| Transport options | Train, bus and taxi providers | `InMemoryTransportProvider` answers from seed catalogues. |
| Recommendations | Recommendation source | `InMemoryRecommendations` serves seed data. |
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
