summary: |
  On the first local start (local mode on, nothing stored yet) the API seeds one confirmed demo user and two sample trips, so a new developer can sign in straight away. Seeding is decided by a single rule, "is local data completely empty?". That one rule gives the other behaviours: a restart finds data and does nothing (no duplicates, edits kept), and a store that holds other data but no demo user is left alone. Sign-up is untouched. The sign-in page also shows the "Demo account is ready" hint from the approved design, but only once the demo user exists. The API exposes the demo details through `/startup-status`, in local mode only.

scope:
  - description: |
      Prerequisite gate, no code. The "Local data storage" and "Local sign-in and accounts" sibling epics are NOT in the code yet. `deps.get_trips()` always returns `DynamoTripStore`, `auth.get_identity()` always returns `CognitoIdentityProvider`, and the only in-memory versions are test fakes (`InMemoryTripStore`, `FakeIdentityProvider`). Before wiring, the implementer re-checks `main` for the sibling work (a persistent local trip store, a local identity provider, and the local-mode selection in `deps.py` and `auth.py`). If it is still missing, the implementer builds and tests the seed logic against the protocols (steps below) and stops at wiring, reporting the blocker instead of inventing a storage layer.
    files: []
    rationale: |
      Seeding needs somewhere persistent to write and a way to ask "is it empty?". Building that here would duplicate the sibling epics.

  - description: |
      New module `app/local_seed.py`: the seed rule and the demo fixture. It does no I/O beyond the objects passed in.

      ```python
      DEMO_EMAIL = "demo@example.com"
      DEMO_PASSWORD = "demo-password-1"  # must satisfy app.auth.password.validate_password

      class SeedableIdentity(Protocol):
          def create_confirmed_user(self, email: str, password: str) -> str:
              """Create an already-confirmed account and return its user id."""
          def account_exists(self, email: str) -> bool: ...

      def seed_demo_data(
          *,
          is_empty: Callable[[], bool],
          identity: SeedableIdentity,
          trips: TripStore,
          today: date,
      ) -> bool:
          """Seed the demo user and sample trips only when local data is completely empty.
          Returns True when it seeded, False when it did nothing."""
      ```

      Rules: if `not is_empty()` return False. Otherwise call `identity.create_confirmed_user(DEMO_EMAIL, DEMO_PASSWORD)`, then save two sample trips with `trips.save_trip(user_id, Trip(...))`. The trips are "Weekend in Lisbon" (3 nights) and "Summer in Kyoto" (10 nights), as in the design fixture. Each has a destination, a budget, a currency, a `traveller_count`, and `days` built with `reconcile_days`. Dates are computed from the injected `today` (start about 30 days out) so the samples never go stale. Trip ids come from `uuid4().hex`. Nothing is ever re-saved or updated once seeded, which is what keeps edits.
    files:
      - services/api/app/local_seed.py
    rationale: |
      One emptiness check gives AC1, 2, 4, 5 and 7. A trip is never overwritten and the demo user is never looked up on restart, so no "repair" path can create duplicates or clobber edits.

  - description: |
      Test doubles and the emptiness probe. Add `create_confirmed_user` and `account_exists` to `FakeIdentityProvider` (the fake already has `confirm` and `account_count`; `create_confirmed_user` reuses the `sign_up_email` bookkeeping, then marks the user confirmed). Add `is_empty()` to `InMemoryTripStore`, or a tiny test helper, so tests can express "no local data". The sibling local stores must expose the same two capabilities; the wiring step below names where.
    files:
      - services/api/app/auth/fake_identity.py
      - services/api/app/trips/store.py
    rationale: |
      Lets every acceptance criterion be tested end to end with the existing fixtures and no real storage.

  - description: |
      Wire seeding into startup. In `lifespan`, after `get_settings()`, add `if settings.local_mode: run_first_start_seed(settings)`. Local mode off means nothing is read or written, so production behaviour is unchanged. `run_first_start_seed` lives in `app/local_seed.py` and resolves the local stores through a new `deps.get_local_seed_target()`. That returns the `is_empty` probe, the `SeedableIdentity` and the `TripStore`, all backed by the sibling epics' local implementations. It raises a clear error if local mode is on but those stand-ins are absent.
    files:
      - services/api/app/main.py
      - services/api/app/routers/deps.py
      - services/api/app/local_seed.py
    rationale: |
      The existing guard in `lifespan` already refuses local mode outside the local environment, so seeding can only run where local mode is allowed.

  - description: |
      Expose the demo details for the sign-in hint. `GET /startup-status` gains one field, `demo_account`. It is `{"email": ..., "password": ...}` only when local mode is on and `identity.account_exists(DEMO_EMAIL)` is true. In every other case it is `null`.
    files:
      - services/api/app/routers/startup_status.py
    rationale: |
      The design's hint "appears only once the demo user exists". The password is only sent when `APP_ENV` is `local`, which `resolve_local_mode` already guarantees.

  - description: |
      Web: show the design's demo hint on the sign-in page. Add `fetchStartupStatus()` to `src/auth/api.ts`. `SignInPage` reads `demo_account` and, when present, passes the hint through `AuthForm`'s existing `notice` prop, next to the return-to notice. The hint is the prototype's `.alert.alert-info.stack.stack-sm` with `.alert-title` "Demo account is ready", a `.text-sm` paragraph showing the email and password in `<code>`, and a `.btn.btn-secondary.btn-sm` "Fill in demo details". The button sets the email and password fields, and the fields stay editable. A failed or 404 status call shows no hint and no error. Do not build the prototype-only "Local data" panel.
    files:
      - apps/web/src/auth/api.ts
      - apps/web/src/auth/SignInPage.tsx
      - apps/web/src/auth/AuthForm.tsx
      - apps/web/src/auth/SignInPage.test.tsx
    rationale: |
      This is the only UI the design adds to the real app. It uses existing classes and tokens only: light theme, `--space-*` gaps, a button label that starts with a verb, and a single `.btn-primary` ("Sign in") kept on the screen.

  - description: |
      Document the demo account in the API README: what is seeded, when (first local start only, empty data only), how to get a fresh start (clear local data), and that the demo password is for local use only.
    files:
      - services/api/README.md
    rationale: |
      The parent epic requires docs that list what is faked.

tests:
  - |
    AC1, first start seeds a confirmed demo user. File `services/api/tests/unit/test_local_seed.py`, written first; fails until `app/local_seed.py` exists.
    ```python
    def test_first_start_creates_confirmed_demo_user():
        identity, trips = FakeIdentityProvider(), InMemoryTripStore()
        seeded = seed_demo_data(is_empty=lambda: not identity.account_exists(DEMO_EMAIL) and not trips.list_trips("user-1"),
                                identity=identity, trips=trips, today=date(2026, 1, 1))
        assert seeded is True
        assert identity.sign_in_email(DEMO_EMAIL, DEMO_PASSWORD)  # raises EmailNotConfirmed if not confirmed
    ```
  - |
    AC2, the demo user has two sample trips listed, through the real route.
    ```python
    def test_demo_user_lists_two_sample_trips(seeded_client):
        names = [t["name"] for t in seeded_client.get("/trips").json()]
        assert sorted(names) == ["Summer in Kyoto", "Weekend in Lisbon"]
    ```
  - |
    AC3, sign-in with the demo details works without a sign-up. `POST /auth/sign-in` is called with no earlier `/auth/sign-up` and the demo details.
    ```python
    r = client.post("/auth/sign-in", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
    assert r.status_code == 200
    assert client.get("/auth/me").status_code == 200
    ```
    Also `assert validate_password(DEMO_PASSWORD)`, so the demo password obeys the real password rule.
  - |
    AC4, a restart adds nothing. Call `seed_demo_data` twice against the same stores.
    ```python
    assert seed_demo_data(...) is True
    assert seed_demo_data(...) is False
    assert identity.account_count(DEMO_EMAIL) == 1
    assert len(trips.list_trips(demo_user_id)) == 2
    ```
  - |
    AC5, an edited sample trip keeps its edits. The test seeds, then sends `PUT /trips/{id}` with a new name through the signed-in client, then seeds again.
    ```python
    seed_demo_data(...)
    client.put(f"/trips/{trip_id}", json={**body, "name": "Lisbon, extended"})
    seed_demo_data(...)  # restart
    assert "Lisbon, extended" in [t["name"] for t in client.get("/trips").json()]
    assert "Weekend in Lisbon" not in [t["name"] for t in client.get("/trips").json()]
    ```
  - |
    AC6, a new visitor can sign up after seeding.
    ```python
    seed_demo_data(...)
    r = client.post("/auth/sign-up", json={"email": "sam@example.com", "password": "abcdefghij12"})
    assert r.status_code == 202
    assert identity.account_count("sam@example.com") == 1
    ```
    Also assert that a second sign-up with `DEMO_EMAIL` returns 400 `could_not_create`, so the demo account is not silently replaced.
  - |
    AC7, other local data with no demo user or sample trips means nothing is added. Cover both shapes the design's "Another account only" scenario implies: a user only, and a trip only.
    ```python
    identity.sign_up_email("sam@example.com", "abcdefghij12")
    assert seed_demo_data(is_empty=lambda: False, identity=identity, trips=trips, today=today) is False
    assert identity.account_exists(DEMO_EMAIL) is False
    assert trips.list_trips("user-1") == []
    ```
  - |
    Wiring (AC1 and AC7 through startup, `services/api/tests/unit/test_local_seed_startup.py`). With `LOCAL_MODE=true` and `APP_ENV=local`, entering the app's lifespan seeds. With `LOCAL_MODE` unset, no seed target is resolved at all.
    ```python
    monkeypatch.delenv("LOCAL_MODE", raising=False)
    with TestClient(app):
        assert seed_calls == []
    ```
  - |
    `/startup-status` hint source, in `test_startup_status_router.py`. `demo_account` is `None` with local mode off, `None` with local mode on but no demo user, and `{"email": DEMO_EMAIL, "password": DEMO_PASSWORD}` once seeded.
  - |
    Web, `SignInPage.test.tsx`, using the existing `mockApi` helper.
    ```tsx
    mockApi({ '/auth/me': { status: 401 }, '/startup-status': { status: 200, body: { local_mode: true, demo_account: { email: 'demo@example.com', password: 'demo-password-1' } } } })
    renderAt('/sign-in')
    expect(await screen.findByText('Demo account is ready')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Fill in demo details' }))
    expect(screen.getByLabelText('Email')).toHaveValue('demo@example.com')
    ```
    A second test returns `demo_account: null` (and a third a 404) and asserts `screen.queryByText('Demo account is ready')` is null. A fourth asserts that the existing "You'll go to ..." return-to notice still renders next to the hint.
  - |
    Local-mode-off regression. Run the full unit suite (`sh run-py.sh -m pytest -c pytest.ini`) and the web suite (`pnpm test`). No existing test may change behaviour, since nothing is seeded with local mode off.

assumptions_or_open_questions:
  - |
    BLOCKER TO CONFIRM. The sibling epics "Local data storage" and "Local sign-in and accounts" are not merged. The `local_mode` flag exists, but there is no persistent local trip store, no local identity provider, and `deps.py` and `auth.py` always build the Dynamo and Cognito versions. The plan assumes they will provide (a) a persistent `TripStore`, (b) an identity provider that can create a confirmed user and report whether an account exists, and (c) a way to ask whether the local data is empty. If they land with different names, only `deps.get_local_seed_target()` changes. Should this item wait for those, or should the seed logic ship first with wiring following?
  - |
    "No local data exists" is defined as no users and no trips, as in the design's `start()`. A crash between creating the demo user and saving its trips leaves a user with no trips. The next start sees data and, per AC7, does not repair it. The developer clears local data to get a fresh first start. Accepted, and documented in the README.
  - |
    Design and rules conflict, password. The prototype uses `demo-password` and its sign-up hint says "At least 8 characters". The real rule (`app/auth/password.py`) is 12 or more characters with a letter and a digit, so the demo password would be refused at sign-in. The plan uses `demo-password-1` and leaves the existing sign-up wording alone.
  - |
    Design and flow conflict, sign-up. The prototype signs a new account in straight away and shows a "Welcome aboard" toast. The real flow returns 202 `confirmation_sent` and waits for email confirmation. AC6 only requires that the account is created, so the existing flow is kept and no sign-up UI change is planned.
  - |
    Not built from the design: the dashed "Prototype only: local data" panel, and the My trips "signed-in user + Confirmed badge + Sign out" row. Real accounts have no display name, and the badge and sign-out row are outside the ACs. The My trips cards and the edit drawer already exist, so AC2 and AC5 are checked at the API and through the existing screens, with no new trip UI.
  - |
    Demo email `demo@example.com` is a reserved example domain, so it cannot belong to a real person, and confirmation email is never sent for it.

estimated_points: 5

package_dependencies: []

notes: |
  ### Data & rollout
  - **Existing data**: no schema, migration or stored-shape change. The seed only adds records, and only into a completely empty local store. Existing local or deployed data is never touched. With local mode off, nothing runs.
  - **Backfill / seed**: this item is the seed. It is idempotent by construction: it runs only when the store is empty, and the first successful run makes the store non-empty. Re-running is a no-op. It never updates or deletes, so edits survive. A partial first run is not repaired (see open questions).
  - **Settings**: no new env var. It reuses `LOCAL_MODE` (default off) and `APP_ENV` (default `production`), already documented in `services/api/README.md`. The demo email and password are code constants, documented in the same README.
  - **Provisioning**: nothing outside local development. Seeding needs the sibling epics' local storage and local sign-in (see the gate in scope).
  - **Order and rollback**: the sibling epics must land first. Rollback is reverting the code. Seeded local data can stay, or the developer can clear local data.

  The demo password is returned by `/startup-status`. That is acceptable only because local mode cannot be on unless `APP_ENV == "local"` (`resolve_local_mode`). A review should check that the field is `null` whenever `local_mode` is false.

  ```mermaid
  flowchart TD
    main[app/main.py lifespan]:::touched -->|run seed when local mode on| seed[app/local_seed.py]:::touched
    main --> cfg[app/config.py get_settings]
    seed -->|build seed target| deps[app/routers/deps.py]:::touched
    seed -->|save sample trips| store[app/trips/store.py TripStore]:::touched
    seed -->|create confirmed demo user| fake[app/auth/fake_identity.py]:::touched
    status[app/routers/startup_status.py]:::touched -->|account_exists for demo hint| seed
    web[web SignInPage.tsx]:::touched -->|GET /startup-status| status
    web --> form[web AuthForm.tsx]:::touched
    deps --> auth[app/routers/auth.py get_identity]
    classDef touched fill:#f96,color:#000
  ```

review_focus: |
  IN scope: the empty-store seed rule (AC1 to 7), startup wiring that only runs in local mode, the `demo_account` field on `/startup-status`, the sign-in demo hint, and the README. OUT: building local storage or local sign-in (sibling epics, see the blocker), the prototype-only panel, and any sign-up or trips UI change. The riskiest parts are the emptiness check (it must make a partial store a no-op, never a repair) and `demo_account` leaking the password when local mode is off. Deliberate: the demo password differs from the prototype's to satisfy the real password rule, and a crash mid-seed is not auto-repaired.
