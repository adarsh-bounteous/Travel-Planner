summary: |
  SIM options only appear for trips dated inside March 2027 because every seeded SIM in services/api/app/sims/providers.py defaults to valid_from 2027-03-01 and valid_to 2027-03-31, and gather_sims requires the SIM validity to cover every trip date. The fix is seed-only: widen the seeded default validity window to a long evergreen range so any trip dates are covered. gather_sims, covers_trip, the sort order and the router are untouched, so shortlist behaviour is unchanged. The one seeded entry that deliberately fails on dates (roamly-europe-3, valid to 2027-03-10) keeps its short window so the date filter still has something to remove. Tests are written first.
scope:
  - description: |
      Widen the seeded SIM validity. Add two module constants and use them as the `_sim` defaults.

      ```python
      SEED_VALID_FROM = date(2000, 1, 1)
      SEED_VALID_TO = date(2099, 12, 31)

      def _sim(..., valid_from: date = SEED_VALID_FROM, valid_to: date = SEED_VALID_TO) -> ProviderSim: ...
      ```

      Leave the roamly-europe-3 call as is. It passes only `valid_to=date(2027, 3, 10)`, so it would now start in 2000 and end 2027-03-10. That is a deliberate expired offer, and a trip in April 2027 or later does not see it. This keeps the March 2027 and April 2027 shortlists for the same country identical (AC4) for trips that start after 2027-03-10, such as the existing 12 to 20 March fixture.
    files:
      - services/api/app/sims/providers.py
    rationale: |
      The only cause of the March 2027 limit is the seed default. Changing the data, not the filter, honours "Seed validity only; SIM shortlist behaviour unchanged".
  - description: |
      Update the existing router test `test_pick_stays_but_flags_when_dates_change`. After the trip moves to April 2027 the shortlist is no longer empty, because April is now covered. The assertion `out["options"] == []` becomes a check that options are listed. The stored pick keeps its original 2027-03 validity, so `covers_dates` stays False, and the flag behaviour from the earlier story is preserved.
    files:
      - services/api/tests/unit/test_sim_options_router.py
    rationale: |
      That assertion encoded the March-only seed and is the only existing test that contradicts the new behaviour.
tests:
  - |
    AC1, written first in services/api/tests/unit/test_sim_options_router.py. It fails today because the shortlist is empty.

    ```python
    def _dated(client, start, end, destination="Lisbon, Portugal"):
        body = trip_body(destination=destination, start_date=start, end_date=end)
        return client.post("/trips", json=body).json()["id"]

    def test_april_2027_trip_shows_sim_options(sign_in_as):
        a = sign_in_as("a@example.com")
        tid = _dated(a, "2027-04-02", "2027-04-09")
        assert a.get(f"/trips/{tid}/sim-options").json()["options"] != []
    ```
  - |
    AC2, March 2028.

    ```python
    def test_march_2028_trip_shows_sim_options(sign_in_as):
        a = sign_in_as("a@example.com")
        tid = _dated(a, "2028-03-12", "2028-03-20")
        assert a.get(f"/trips/{tid}/sim-options").json()["options"] != []
    ```
  - |
    AC3, March 2027 regression guard. It passes before and after the change.

    ```python
    def test_march_2027_trip_shows_sim_options(sign_in_as):
        a = sign_in_as("a@example.com")
        tid = _dated(a, "2027-03-12", "2027-03-20")
        assert a.get(f"/trips/{tid}/sim-options").json()["options"] != []
    ```
  - |
    AC4, the shortlist for April 2027 matches the one for March 2027. It compares ids in order, and the id list also pins ordering.

    ```python
    def test_april_shortlist_matches_march_shortlist(sign_in_as):
        a = sign_in_as("a@example.com")
        ids = lambda s, e: [o["id"] for o in a.get(f"/trips/{_dated(a, s, e)}/sim-options").json()["options"]]
        assert ids("2027-04-02", "2027-04-09") == ids("2027-03-12", "2027-03-20") != []
    ```
  - |
    AC5, dates spanning March and April 2027.

    ```python
    def test_trip_spanning_march_and_april_shows_sim_options(sign_in_as):
        a = sign_in_as("a@example.com")
        tid = _dated(a, "2027-03-28", "2027-04-04")
        assert a.get(f"/trips/{tid}/sim-options").json()["options"] != []
    ```
  - |
    AC6, a starter country with no dates set shows no options. This passes today and guards the unchanged behaviour. The new unit test in services/api/tests/unit/test_sim_options.py also asserts that `gather_sims(SEEDED, trip(start=None, end=None), ...).options == []`, which already exists as `test_no_dates...` and must stay green. If trip_body cannot omit dates, post the body with `start_date` and `end_date` set to None.

    ```python
    def test_trip_without_dates_shows_no_sim_options(sign_in_as):
        a = sign_in_as("a@example.com")
        body = trip_body(destination="Lisbon, Portugal", start_date=None, end_date=None)
        tid = a.post("/trips", json=body).json()["id"]
        assert a.get(f"/trips/{tid}/sim-options").json()["options"] == []
    ```
  - |
    Updated existing test, same file.

    ```python
    out = a.get(f"/trips/{tid}/sim-options").json()
    assert out["options"] != []
    assert out["picked"]["option_id"] == "roamly-europe-10" and out["picked"]["covers_dates"] is False
    ```
  - |
    Narrow verification command, run from services/api before and after the change. The full command also runs the apps/web vitest suite once at the end. The web tests mock the API and need no change.

    ```sh
    (cd services/api && sh run-py.sh -m pytest -c pytest.ini tests/unit/test_sim_options_router.py tests/unit/test_sim_options.py tests/unit/test_cost_sim.py)
    ```
assumptions_or_open_questions:
  - |
    Seeded SIM coverage only includes Portugal, Spain, the rest of Europe, Japan and Thailand. India, Mexico, Morocco and Peru have no seeded SIMs, so a trip to those starter countries still shows no options on any dates. The ACs say "a starter country", but the scope says "Seed validity only". I treated the ACs as being checked against a covered country (Portugal, as in the existing fixtures) and left coverage out. Confirm that adding SIMs for India, Mexico, Morocco and Peru is a separate story.
  - |
    I chose 2000-01-01 to 2099-12-31 as the evergreen seed window. This is seed data only, so any wide range works. Say so if you want a different bound.
  - |
    roamly-europe-3 keeps its short window so the date filter still has a seeded entry to remove. Its window means a trip in March 2027 that ends on or before 2027-03-10 would still list it, while an April trip would not. AC4 compares trips that start after 2027-03-10, as the existing fixtures do.
  - |
    A pick stored before this change holds its 2027-03 validity on the trip record. It stays flagged with covers_dates False for trips outside March 2027, as the earlier story intended. I did not re-validate or migrate stored picks.
estimated_points: 2
package_dependencies: []
notes: |
  ### Data & rollout

  None — this changes in-code seed defaults only. There is no schema, migration, setting or env var. Picks already stored on trips keep their own valid_from and valid_to, because ChosenSim copies them at pick time, and they stay readable. Roll back by reverting the commit.

  Why only the seed: `gather_sims` in services/api/app/sims/options.py calls `covers_trip(x.valid_from, x.valid_to, trip)` and returns no options when the trip has no dates. That logic is correct and is not changed. `InMemorySimProvider` in services/api/app/sims/providers.py is wired through `get_sim_providers` in services/api/app/routers/deps.py, so both the shortlist and the pick route in services/api/app/routers/sim_options.py pick up the new window without changes. Other tests build their own ProviderSim values with explicit dates, so they are not affected: test_sim_options.py defines its own `sim()` helper and test_cost_sim.py passes explicit dates.

  No UI step: apps/web only renders what the API returns.
review_focus: |
  IN: widening the seed validity defaults in services/api/app/sims/providers.py, the new AC tests, and the one updated assertion. OUT: gather_sims, covers_trip, ordering, router, web app, and SIM coverage for India, Mexico, Morocco and Peru. The riskiest part is AC4 and roamly-europe-3. It deliberately keeps its short window, so the March 2027 and April 2027 shortlists match only for trips that start after 2027-03-10. The updated test_pick_stays_but_flags_when_dates_change is intentional, since April trips now have options.
