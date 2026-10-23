summary: |
  Trips and traveller profiles do not exist anywhere in the codebase yet (the API only has health and auth routers; the web app only has auth/account pages and a placeholder "Your trips" home). This item adds the minimum owner-scoped persistence, API and pages so every Trip and traveller profile is stored server-side in the Trip Database under the signed-in traveller's user id, read only through the session cookie's user id, and therefore identical on every device. Another traveller asking for a trip or profile by its address gets a 404 because lookups are keyed by the caller's own id, never by an id supplied in the URL. Sharing with companions is out of scope (Trip itinerary epic).
scope:
  - description: |
      Trip store, keyed by owner. New `TripStore` Protocol with `InMemoryTripStore` and `DynamoTripStore`, mirroring `app/auth/accounts.py`.
      ```python
      class TripStore(Protocol):
          def list_trips(self, owner_id: str) -> list[Trip]: ...
          def get_trip(self, owner_id: str, trip_id: str) -> Trip | None: ...
          def save_trip(self, owner_id: str, trip: Trip) -> None: ...
      ```
      Dynamo layout in a new trips table: `pk = USER#<owner_id>`, `sk = TRIP#<trip_id>`. `list_trips` is a Query on `pk`; `get_trip` is a GetItem with the caller's pk, so another owner's trip id cannot resolve. `Trip` is a small pydantic model: `id`, `name`, optional `destination`, optional `start_date`/`end_date`, `updated_at`.
    files:
      - services/api/app/trips/__init__.py
      - services/api/app/trips/store.py
    rationale: |
      The accounts table only has a hash key (`pk`), so it cannot list per-owner items; a separate table with a sort key makes "only my trips" a single-partition Query and makes cross-owner access structurally impossible.
  - description: |
      Traveller profile store: `ProfileStore` Protocol (`get_profile(owner_id) -> Profile | None`, `save_profile(owner_id, profile)`) with in-memory and Dynamo implementations. The Dynamo version stores the profile as a `profile` map attribute on the existing `USER#<id>` item in the accounts table via `update_item`, so no new table or migration is needed for it. `Profile` fields (minimal): `display_name`, `home_city`, `dietary_notes`, all optional strings with length caps.
    files:
      - services/api/app/trips/profile_store.py
    rationale: One profile per account, already keyed by user id; reuses the existing item and does not touch `google_linked`.
  - description: |
      Current-user dependency plus routers. `get_current_user(session cookie, now) -> str` reads the signed session via `read_session` and raises 401 `{"code": "not_signed_in"}` otherwise; it also slides the cookie like `/auth/me`. Routes (all owner-scoped, the owner id is never taken from the path or body):
      - `GET /trips` lists the caller's trips
      - `POST /trips` creates a trip (server generates the id) and returns 201
      - `GET /trips/{trip_id}` returns the trip or 404 `{"code": "not_found"}`
      - `PUT /trips/{trip_id}` updates it, 404 if it is not the caller's
      - `GET /profile` returns the saved profile, or an empty profile (all fields empty) when none is saved
      - `PUT /profile` saves it
      Wire `get_trips` / `get_profiles` dependency providers (lru_cache Dynamo, like `get_accounts`) and include both routers in `main.py`. Add `trips_table_name` to `Settings`.
    files:
      - services/api/app/routers/deps.py
      - services/api/app/routers/trips.py
      - services/api/app/routers/profile.py
      - services/api/app/main.py
      - services/api/app/config.py
      - services/api/README.md
    rationale: Server-side, session-derived ownership is what makes data private and identical across devices. 404 (not 403) for another traveller's trip avoids revealing that it exists.
  - description: |
      Web API client and pages. `apps/web/src/trips/api.ts` with `fetchTrips`, `createTrip`, `fetchTrip`, `updateTrip`, `fetchProfile`, `saveProfile` (all `fetch` with `credentials: 'same-origin'`; no localStorage cache, so every load reflects the server). Pages, each wrapped in `<RequireAuth>`:
      - `/` becomes `MyTripsPage` (list + "New trip" link; empty state keeps the existing copy) replacing the trip text in `HomePage`; the sign-out button stays
      - `/trips/new` and `/trips/:tripId` share `TripForm` (create or edit); a 404 shows a "Trip not found" state
      - `/profile` is `ProfilePage` with a blank form when nothing is saved, saved values otherwise
      Add a "Profile" `NavLink` in `AppHeader`, next to Account. Follow `design-system/UI-GUIDELINES.md` classes already used by `AccountPage`.
    files:
      - apps/web/src/trips/api.ts
      - apps/web/src/trips/MyTripsPage.tsx
      - apps/web/src/trips/TripForm.tsx
      - apps/web/src/trips/TripPage.tsx
      - apps/web/src/profile/ProfilePage.tsx
      - apps/web/src/auth/HomePage.tsx
      - apps/web/src/App.tsx
      - apps/web/src/AppHeader.tsx
    rationale: The ACs are stated from the traveller's view (My trips, saving a trip, opening a profile), so the UI must exist to satisfy them end to end.
  - description: |
      Tests, written first (see `tests`): API unit tests in `services/api/tests/unit/`, API e2e in `services/api/tests/e2e/`, vitest component tests beside each page, and a Playwright spec for the two-device and two-traveller flows.
    files:
      - services/api/tests/unit/test_trips_router.py
      - services/api/tests/unit/test_profile_router.py
      - services/api/tests/unit/test_trip_store.py
      - services/api/tests/e2e/test_ownership_e2e.py
      - apps/web/src/trips/MyTripsPage.test.tsx
      - apps/web/src/trips/TripForm.test.tsx
      - apps/web/src/profile/ProfilePage.test.tsx
      - apps/web/e2e/ownership.spec.ts
    rationale: Test-first per the story; each AC maps to at least one failing test below.
tests:
  - |
    AC1 and AC4 (API unit, `test_trips_router.py`). Two signed-in travellers each save a trip; each lists only their own.
    ```python
    a.post("/trips", json={"name": "Lisbon"})
    b.post("/trips", json={"name": "Oslo"})
    assert [t["name"] for t in a.get("/trips").json()] == ["Lisbon"]
    assert [t["name"] for t in b.get("/trips").json()] == ["Oslo"]
    ```
    Also `assert a.post("/trips", json={"name": "Lisbon"}).status_code == 201` and that the new trip then appears in `GET /trips` (AC4).
  - |
    AC2, AC5 and AC7 (API unit, `test_profile_router.py`).
    ```python
    assert a.get("/profile").json() == {"display_name": "", "home_city": "", "dietary_notes": ""}  # AC7
    assert a.put("/profile", json={"display_name": "Maya", "home_city": "Leeds", "dietary_notes": ""}).status_code == 200
    assert a.get("/profile").json()["display_name"] == "Maya"   # AC5
    assert b.get("/profile").json()["display_name"] == ""       # AC2: B never sees A's details
    ```
  - |
    AC6 (API unit). B cannot open or change A's trip by its address, and the response does not reveal it exists.
    ```python
    trip_id = a.post("/trips", json={"name": "Lisbon"}).json()["id"]
    assert b.get(f"/trips/{trip_id}").status_code == 404
    assert b.put(f"/trips/{trip_id}", json={"name": "Hijacked"}).status_code == 404
    assert a.get(f"/trips/{trip_id}").json()["name"] == "Lisbon"
    ```
    Plus signed-out calls: `assert client.get("/trips").status_code == 401` and the same for `/profile`, `/trips/{id}`.
  - |
    AC3 and AC8 (API e2e, pytest + httpx, `test_ownership_e2e.py`). Two separate clients with separate cookie jars sign in as the same account (two devices). Client 1 saves a trip and profile, client 2 sees both. Client 1 then edits the trip and profile and client 2 reloads and sees the changes.
    ```python
    device1.put(f"/trips/{tid}", json={"name": "Lisbon 2"})
    assert device2.get(f"/trips/{tid}").json()["name"] == "Lisbon 2"
    ```
  - |
    Store unit test (`test_trip_store.py`), run against both `InMemoryTripStore` and `DynamoTripStore` (the latter with a stubbed table that records keys): `get_trip("owner-b", trip_id)` is `None` for a trip saved by `owner-a`, and the Dynamo calls use `Key={"pk": "USER#owner-a", "sk": "TRIP#<id>"}` / `KeyConditionExpression` on the caller's pk only.
  - |
    Web (vitest). `MyTripsPage.test.tsx` renders trips returned by the mocked `fetchTrips` and an empty state when none (AC1, AC4: after `TripForm` submit `createTrip` is called and the user is returned to the list). `ProfilePage.test.tsx`:
    ```tsx
    expect(screen.getByLabelText('Display name')).toHaveValue('')   // AC7 blank form
    ```
    and that saved values prefill after load and `saveProfile` is called with the form values (AC5). A trip page whose `fetchTrip` rejects with not-found shows "Trip not found" (AC6 in the UI).
  - |
    Web (Playwright, `ownership.spec.ts`). Two browser contexts as traveller A and B: B navigates to A's `/trips/<id>` and sees "Trip not found" (AC6). Two contexts signed in as the same traveller: a change made in one is visible after reloading the other (AC3, AC8). Written against the same auth setup the existing `account.spec.ts` uses.
assumptions_or_open_questions:
  - |
    The story does not define Trip or profile fields. I assumed a deliberately minimal Trip (name, optional destination and dates) and profile (display name, home city, dietary notes) so ownership can be built and tested now; the Trip itinerary epic is expected to extend Trip. Please confirm or give the real field list.
  - |
    A new DynamoDB trips table (`pk` string hash key, `sk` string range key) is assumed. No infrastructure-as-code exists in this repo, so I assumed the table is provisioned outside it. Alternative: add a GSI on the accounts table instead; I rejected it because the accounts table has no sort key.
  - |
    Another traveller's trip returns 404 rather than 403 so existence is not revealed; the web page shows the same "not found" state as for a trip that never existed.
  - |
    Edit of a trip (PUT) is included because AC8 requires "changes a trip" to propagate. Deleting a trip is not in the ACs and is left out.
  - |
    The sign-in redirect and RequireAuth already protect pages for signed-out visitors, so only the API 401 path is added here. "Sign in on another device" needs no new auth code since data is fetched from the server with the session user id.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout

  - **Existing data**: No existing rows are changed. Trips go to a new table. The profile is a new `profile` attribute on the existing `USER#<id>` account item (written with `update_item`, which preserves `google_linked`). Accounts without it read as a blank profile, so no existing account is locked out. A test covers this: `get_profile` on an item that has only `google_linked` returns `None` and `GET /profile` returns the blank profile.
  - **Backfill / seed**: None. There are no pre-existing trips or profiles to attribute to anyone.
  - **Settings**: `TRIPS_TABLE_NAME`, default `trip-planner-trips` (same pattern as `ACCOUNTS_TABLE_NAME`), documented in `services/api/README.md`.
  - **Provisioning**: A DynamoDB table named by `TRIPS_TABLE_NAME` with string `pk` (hash) and `sk` (range) keys, and Lambda IAM permission for `GetItem`, `PutItem`, `Query` on it. Not in this repo, so it must be created in the deploy environment first.
  - **Order and rollback**: Create the table, then deploy the API, then the web app. Rollback: redeploy the previous versions. The table and the `profile` attribute can stay in place; nothing else reads them.

  GDPR (ADR-0011): trips and profile are personal data; they are keyed by user id so they can be exported or deleted per account later. Do not log profile or trip contents.

  ```mermaid
  flowchart TD
    Web[apps/web pages] --> Router[routers/trips.py and profile.py]
    Router --> Deps[routers/deps.py get_current_user]
    Deps --> Session[auth/session.py read_session]
    Router --> TripStore[trips/store.py]
    Router --> ProfileStore[trips/profile_store.py]
    TripStore --> Dynamo[(Trips table)]
    ProfileStore --> Acc[(Accounts table USER item)]
    Main[main.py] --> Router
    classDef touched fill:#f96,color:#000
    class Web,Router,Deps,TripStore,ProfileStore,Main touched
  ```
review_focus: |
  IN scope: owner-scoped storage, API and pages for Trips and traveller profile. OUT: sharing with companions, trip deletion, itinerary content. The riskiest part is ownership: check that no route takes an owner id from the path or body, and that every store lookup is keyed by the session's user id (404 for a foreign trip is deliberate). Trip and profile field sets are intentionally minimal placeholders; the new trips table is assumed to be provisioned outside the repo.
