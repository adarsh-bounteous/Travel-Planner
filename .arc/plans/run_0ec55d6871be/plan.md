summary: |
  Add one local setup document (docs/local-setup.md) linked from the root README. It covers the clean-checkout steps (`pnpm start`), the demo sign-in details (demo@example.com / demo-password-1), a single reset step, and a list of every faked cloud dependency (Identity Provider, Trip Database, Email Delivery, Maps and Places, Flight and Hotel Search, plus transport, recommendations and rates), each with how it is faked locally. Doc drift is guarded by a node test that reads the doc and checks it against the real constants and code (demo credentials from services/api/app/local_seed.py, the stand-in list, the reset step). Existing behaviour tests prove that a restart clears local data and re-seeds the demo account and sample trips. No production behaviour changes unless the reviewer decides the reset or inbox questions below need code.
scope:
  - description: |
      Create docs/local-setup.md with these sections: Setup steps (Node 22, pnpm, Python 3.12, `pnpm start`, ports, the URL to open); Demo sign-in (the email and password, taken from `DEMO_EMAIL` and `DEMO_PASSWORD` in local_seed.py); Reset (one step, see the open question); What is faked (a table with one row per faked cloud dependency and a "How it is faked locally" column); Email delivery and the local inbox (full address, see the open question).
      Faked list, each verified in code: Identity Provider (Cognito) is `FakeIdentityProvider` in app/auth/fake_identity.py, in memory, with the account store in memory; Trip Database (DynamoDB) is `InMemoryTripStore` and `InMemoryAccountStore`; Email Delivery (SES) is `NoInviteSender`, so nothing is sent; Maps and Places is `InMemoryPlaceSearch` over `SEED_CATALOGUE`; Flight and Hotel Search is `InMemoryFlightProvider`, `InMemoryStayProvider` and `InMemoryTransportProvider` over seed catalogues; recommendations and currency rates are in-memory seeds.
      The doc must not claim anything the code doesn't do. Today the profile and saved-places stores still point at DynamoDB in local mode (deps.py `_profiles` and `_saved_places`). The doc must either say so or the reviewer must widen scope.
    files:
      - docs/local-setup.md
    rationale: |
      Delivers AC 1-6. A separate doc keeps the API README for settings and links to the new one, so there is a single source for setup.
  - description: |
      Link the new doc from the root README quick start, and point the API README "Run it locally" section at it so the demo account and stand-in facts are not duplicated and cannot disagree.
    files:
      - README.md
      - services/api/README.md
    rationale: Discoverability for a new developer on a clean checkout (AC 1).
  - description: |
      Add scripts/local-setup-docs.test.mjs, run by the existing `pnpm test` (add it to the file list in package.json). It reads docs/local-setup.md and services/api/app/local_seed.py. See `tests` for the assertions.
    files:
      - scripts/local-setup-docs.test.mjs
      - package.json
    rationale: Keeps the docs true when the demo credentials, the stand-ins or the start command change (AC 2-6).
tests:
  - |
    AC1 (node, scripts/local-setup-docs.test.mjs). The setup steps name the real start command and ports, and the command exists.
    ```js
    const doc = readFileSync('docs/local-setup.md', 'utf8')
    assert.match(doc, /pnpm start/)
    assert.equal(JSON.parse(readFileSync('package.json', 'utf8')).scripts.start, 'node scripts/start.mjs')
    assert.match(doc, /5173/)
    ```
    Existing scripts/start.integration.test.mjs already covers that `pnpm start` serves the app with the demo sign-in working. If it does not assert sign-in with the demo account, extend it to do so.
  - |
    AC2 (node). The doc shows the credentials that local_seed.py really seeds.
    ```js
    const seed = readFileSync('services/api/app/local_seed.py', 'utf8')
    const email = seed.match(/DEMO_EMAIL = "([^"]+)"/)[1]
    const password = seed.match(/DEMO_PASSWORD = "([^"]+)"/)[1]
    assert.ok(doc.includes(email))
    assert.ok(doc.includes(password))
    ```
  - |
    AC3 (node). Exactly one reset step is documented, under a Reset heading.
    ```js
    const reset = doc.split(/^## Reset/m)[1].split(/^## /m)[0]
    assert.equal((reset.match(/^\s*(\d+\.|\$|    \S)/gm) ?? []).length, 1)
    ```
  - |
    AC4 (node). Every faked dependency is listed. The names are the Integration ADR names (ADR-0003, 0007, 0008, 0009, 0010).
    ```js
    for (const name of ['Identity Provider', 'Trip Database', 'Email Delivery', 'Maps and Places', 'Flight and Hotel Search'])
      assert.match(doc, new RegExp(name))
    ```
  - |
    AC5 (node). Every row of the faked table has a non-empty "how it is faked" cell, and the class named there still exists in the API source.
    ```js
    for (const row of fakedRows(doc)) {
      assert.ok(row.how.trim().length > 0)
      for (const cls of row.classes) assert.ok(apiSourceContains(cls), cls)
    }
    ```
  - |
    AC6 (node). The Email Delivery entry shows the full inbox address, scheme, host, port and path, built from the Web App default port. The path is decided in the open question.
    ```js
    const email = doc.split(/Email delivery/i)[1]
    assert.match(email, /http:\/\/localhost:5173\/\S+/)
    ```
  - |
    AC7 (pytest, services/api/tests/unit/test_local_seed_startup.py). Reuse or add a test that local data created while running is gone on a fresh start, which is what the documented reset does.
    ```python
    def test_fresh_start_clears_local_data(local_app_factory):
        with local_app_factory() as first:
            first.post("/trips", json=TRIP, cookies=sign_in(first))
        with local_app_factory() as second:  # new process state
            assert second.get("/trips", cookies=sign_in(second)).json() == SAMPLE_TRIPS_ONLY
    ```
  - |
    AC8 (pytest, same file). After a fresh start the documented credentials sign in and the sample trips are listed.
    ```python
    resp = client.post("/auth/sign-in", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
    assert resp.status_code == 200
    assert [t["name"] for t in client.get("/trips").json()] == ["Weekend in Lisbon", "Summer in Kyoto"]
    ```
    The sign-in path and response shape must be confirmed against app/routers/auth.py before writing this. If existing tests already assert the same, reference them and add nothing.
assumptions_or_open_questions:
  - |
    BLOCKER for AC6. No local email inbox page exists in the repo today. I found no inbox, outbox or mailbox code in services/api or apps/web, and in local mode `_invite_sender()` returns `NoInviteSender`, so nothing is captured. The AC asks the docs to show the inbox's full local address, which I cannot state truthfully. Options: (a) a separate story builds the inbox first and this plan uses its real URL; (b) this item also adds a minimal local inbox (an in-memory sender plus a page and proxy entry), which makes the item much bigger (about 5 points). Please tell me which. Until then the plan has the doc describe the stand-in honestly, and AC6 stays unmet.
  - |
    AC3 and AC7 need a "single reset step". Local data is entirely in memory (InMemoryTripStore, InMemoryAccountStore, FakeIdentityProvider), so nothing is stored on disk and there is no reset command. My default is to document "stop `pnpm start` (Ctrl+C) and run `pnpm start` again" as the one step, since every start begins empty and re-seeds. If the reviewer wants a literal command (for example `pnpm reset`, or a local-only reset endpoint that clears the stores and re-seeds without a restart), that is new code and a few more points.
  - |
    Discrepancy to confirm. In local mode the profile and saved-places stores still use DynamoDB (deps.py `_profiles` and `_saved_places` do not follow the local switch). A clean checkout has no AWS access, so those pages may fail locally. I plan to document this as a known gap rather than fix it here. Say if you want it fixed in this item.
  - Assumed the doc lives in docs/local-setup.md because the repo has no docs directory yet. The root README only links to it.
  - The prompt's untrusted work-item text contained no instructions beyond the change itself, so nothing was excluded.
estimated_points: 3
package_dependencies: []
notes: |
  ### Data & rollout

  None — documentation and a doc-consistency test only. There is no schema, stored data, seed, setting or env var change. The existing seed (local_seed.py) and the settings in services/api/README.md are only described, not changed. If the reviewer chooses a reset command or an inbox, this section must be redone.

  Existing facts the doc is built on, all read in this session: `pnpm start` is scripts/start.mjs, which sets LOCAL_MODE=true, APP_ENV=local and COOKIE_SECURE=false, installs web and API dependencies on first run, and fails if either port is busy. The demo account and the two sample trips are seeded only when local data is empty. `GET /startup-status` returns the demo account in local mode.

  ```mermaid
  flowchart TD
    README[README.md]:::touched -->|link to the new doc| DOC[docs/local-setup.md]:::touched
    APIREADME[services/api/README.md]:::touched -->|point to the new doc| DOC
    TEST[scripts/local-setup-docs.test.mjs]:::touched -->|reads and checks| DOC
    TEST -->|reads the demo credentials| SEED[services/api/app/local_seed.py]
    PKG[package.json]:::touched -->|runs the new test| TEST
    START[scripts/start.mjs] -->|the documented command| DOC
    classDef touched fill:#f96,color:#000
  ```
review_focus: |
  Held to docs plus one doc-consistency test. No production code is in scope unless the reviewer answers the inbox or reset questions otherwise. The riskiest part is truthfulness. The doc must not claim a local inbox or a reset command that doesn't exist, and must not say profile and saved places are faked while deps.py still points them at DynamoDB. AC6 is currently blocked, because no inbox page exists. The reset step is deliberately "restart `pnpm start`" because all local data is in memory.
