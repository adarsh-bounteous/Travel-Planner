# Local setup

Run the whole app on your machine with no cloud account. Local mode swaps the cloud dependencies
for in-memory stand-ins, listed below.

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

All local data lives in memory, so there is nothing on disk to delete. To reset, stop `pnpm start`
with Ctrl+C and run it again:

    pnpm start

The new start has no data except the demo account and the two sample trips, which are seeded again.

## What is faked

| Cloud dependency | What it replaces | How it is faked locally |
| --- | --- | --- |
| Identity Provider | Cognito | `FakeIdentityProvider` keeps sign-in and accounts in memory; the account links sit in `InMemoryAccountStore`. |
| Trip Database | DynamoDB trips | `InMemoryTripStore` holds Trips in memory. |
| Email Delivery | SES | `NoInviteSender` sends nothing; the owner copies the invite link from the Travelers tab. |
| Maps and Places | Places search | `InMemoryPlaceSearch` searches a seed catalogue. |
| Flight and Hotel Search | Flight and stay providers | `InMemoryFlightProvider` and `InMemoryStayProvider` answer from seed catalogues. |
| Transport options | Train, bus and taxi providers | `InMemoryTransportProvider` answers from seed catalogues. |
| Recommendations | Recommendation source | `InMemoryRecommendations` serves seed data. |
| Currency rates | Rate source | `InMemoryRates` serves seed rates. |

Not faked yet: the traveller profile and saved places still use `DynamoProfileStore` and
`DynamoSavedPlaceStore` in local mode, so those pages may fail without AWS access.

## Email delivery and the local inbox

Local mode sends no email, and there is no local inbox page yet, so there is no inbox address to
open. Editor invite links are shown in the Travelers tab instead.
