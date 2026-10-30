# 10 Real booking and checkout (one vertical first)

Read `docs/agent-prompts/RULES.md` first. This builds on prompts 07 and 09. **Before you start**,
confirm these are in place and stop if any is missing: a provider contract that allows booking
through this app, a payment provider account (`<PAYMENT_PROVIDER>`, for example Stripe), and
agreement on the terms and conditions, refund policy and data handling.

**Vertical:** `<VERTICAL>` (start with the one whose provider supports a sandbox booking flow, for
example flights through Duffel).

## Goal
Turn the "Book trip" drawer into real booking for one vertical, safely. The other verticals keep
linking out to the provider.

## Build
1. **Booking state machine**: quoted → price re-checked → payment authorised → booked with
   provider → confirmed, plus failed, cancelled and refunded. Store every transition with a
   timestamp. Each step is retry-safe, with idempotency keys for both the payment provider and the
   booking provider.
2. **Price re-check** before payment. If the price or availability changed, show the new price and
   ask again (no silent increases).
3. **Payments**: use the payment provider's hosted checkout or elements, so card data never
   touches this API (keep PCI scope minimal). Authorise first, then capture only after the provider
   confirms the booking. Release the authorisation on failure. Handle webhooks with signature
   checks and replay protection.
4. **Traveller details**: collect only the fields the provider requires (names as on passport,
   date of birth if required, contact). Store them encrypted, for the shortest time allowed, and
   never log them.
5. **Confirmation**: a booking reference, the provider confirmation, a receipt email (SES or local
   inbox) and the booking shown on the trip with a status badge (the v2 badge rules).
6. **Cancellation and refunds**: follow the provider's rules. Show the refund amount before the
   traveller confirms.
7. **Local mode**: a fully simulated provider and payment flow, including failure cases
   (declined card, price change, provider timeout after payment). No outside call unless opted in.
8. **Operations**: alerts for stuck states (for example "paid but not booked" after N minutes)
   through the existing alert sink, plus a short runbook in `docs/`.

## Tests
State machine transitions, including every failure path; idempotent retries; webhook signature and
replay; the price-change prompt; refund maths with currency; no card or passport data in logs; and
an e2e test of the full local-mode booking.

## Security review
Run a security review of the branch before merge. Report the results: authorisation on every
booking endpoint, CSRF on state-changing calls, webhook verification, secret handling and
personal data retention.

## Done when
- In local mode a booking completes, fails and refunds correctly.
- With sandbox providers opted in, one real sandbox booking completes end to end.
- The security review has no open high findings, and every test passes.
