summary: |
  Local account storage already exists: `LocalIdentityProvider` (services/api/app/auth/local_identity.py) keeps accounts in a SQLite file under LOCAL_DATA_DIR, wired in by `_local_identity()` in app/routers/auth.py, with no DynamoDB accounts table involved. Most acceptance criteria are therefore already true in behaviour but are not pinned by tests. The one real gap is that `create_confirmed_user` (and, under a race, `sign_up_email`) lets a duplicate email hit the SQLite UNIQUE constraint and escape as a raw `sqlite3.IntegrityError` instead of the domain `EmailTaken`. This plan writes the five criteria as tests first, then makes the minimum change so every duplicate creation path is refused with `EmailTaken` (which `/auth/sign-up` already shows as a visible `400 could_not_create`), leaving the existing account intact.
scope:
  - description: |
      Add the AC tests first. Provider-level tests go in test_local_identity.py (reuse its `env` fixture, `EMAIL`, `PASSWORD`). The HTTP-level visible-error and no-cloud-table checks go in test_local_sign_up_confirm.py (reuse its `local_client` fixture and `sign_up` helper). Run them and watch the AC3/AC4 provider tests fail on the create_confirmed_user path; AC1, AC2 and AC5 are expected to pass immediately because they pin existing behaviour.
    files:
      - services/api/tests/unit/test_local_identity.py
      - services/api/tests/unit/test_local_sign_up_confirm.py
    rationale: |
      TDD order. Pins existing behaviour and exposes the one failing path.
  - description: |
      In `LocalIdentityProvider`, route both creation paths through one private insert that refuses a duplicate with `EmailTaken`. Keep the lowercase normalisation and also catch `sqlite3.IntegrityError` so a concurrent insert cannot leak a raw database error.

      ```python
      def _insert_user(self, email: str, password: str, confirmed: int) -> str:
          email = email.lower()
          user_id = f"user-{uuid4().hex}"
          try:
              self._run(
                  "INSERT INTO users (user_id, email, password_hash, confirmed) VALUES (?, ?, ?, ?)",
                  user_id, email, _hash_password(password), confirmed,
              )
          except sqlite3.IntegrityError as error:
              raise EmailTaken from error
          return user_id
      ```

      `create_confirmed_user` becomes `return self._insert_user(email, password, 1)`. `sign_up_email` keeps its `account_exists` pre-check (so no confirmation email is sent for a duplicate), calls `self._insert_user(email, password, 0)`, then `self._issue_link(email.lower())`.
    files:
      - services/api/app/auth/local_identity.py
    rationale: |
      Smallest change that makes AC3 and AC4 hold for every creation path, including the demo user seed that calls create_confirmed_user. A refused attempt writes nothing, so AC5 holds.
tests:
  - |
    AC1 - an account created locally is found by its email, with no cloud accounts table. Provider level in test_local_identity.py:

    ```python
    def test_created_account_is_found_by_email(env):
        provider = env["make"]()
        provider.create_confirmed_user(EMAIL, PASSWORD)
        assert provider.account_exists(EMAIL)
        assert provider.user_id_for(EMAIL).startswith("user-")
    ```

    HTTP level in test_local_sign_up_confirm.py: with `local_client` (local mode on, no accounts table configured), `sign_up(local_client).status_code == 202` and `auth._local_identity().account_exists("ana@example.com")` is true.
  - |
    AC2 - the account is still found after the API restarts (a second provider on the same file):

    ```python
    def test_account_is_found_after_restart(env):
        env["make"]().create_confirmed_user(EMAIL, PASSWORD)
        restarted = env["make"]()
        assert restarted.account_exists(EMAIL)
        assert restarted.user_id_for(EMAIL)
    ```
  - |
    AC3 - a differently cased email is refused as a duplicate on both creation paths (fails today on create_confirmed_user, which raises sqlite3.IntegrityError):

    ```python
    def test_differently_cased_email_is_a_duplicate(env):
        provider = env["make"]()
        provider.create_confirmed_user("anna@example.com", PASSWORD)
        with pytest.raises(EmailTaken):
            provider.create_confirmed_user("Anna@Example.com", PASSWORD)
        with pytest.raises(EmailTaken):
            provider.sign_up_email("Anna@Example.com", PASSWORD)
    ```

    HTTP level: sign up with `ana@example.com`, then with `Ana@Example.com`; assert `second.status_code == 400` and `second.json() == {"code": "could_not_create"}`.
  - |
    AC4 - the same email is refused with a visible error, and the existing account is still found:

    ```python
    def test_same_email_is_refused(env):
        provider = env["make"]()
        provider.create_confirmed_user("anna@example.com", PASSWORD)
        with pytest.raises(EmailTaken):
            provider.create_confirmed_user("anna@example.com", PASSWORD)
        assert provider.account_exists("anna@example.com")
    ```

    HTTP case: sign up twice with the same email, then `assert second.status_code == 400` and `assert second.json() == {"code": "could_not_create"}`.
  - |
    AC5 - lookup by a differently cased email finds the existing account, and a refused duplicate leaves it unchanged (same user id, original password still signs in):

    ```python
    def test_lookup_ignores_email_case_and_refused_duplicate_changes_nothing(env):
        provider = env["make"]()
        user_id = provider.create_confirmed_user("anna@example.com", PASSWORD)
        assert provider.account_exists("Anna@Example.com")
        assert provider.user_id_for("Anna@Example.com") == user_id
        with pytest.raises(EmailTaken):
            provider.create_confirmed_user("anna@example.com", "differentpass99")
        assert provider.sign_in_email("anna@example.com", PASSWORD) == user_id
    ```
assumptions_or_open_questions:
  - |
    I treated the existing SQLite-backed `LocalIdentityProvider` as the "account storage" this story asks for, since it already holds email-keyed accounts locally and survives restarts. I did not move accounts into the JSON data file (`LocalDataFile` / store.json). `PersistentTripStore._flush` rewrites that whole file from its own keys, so sharing it would risk clobbering. If the reviewer wants one storage file, say so and the plan grows.
  - |
    "Found by its email" is taken to mean `account_exists(email)` and `user_id_for(email)`. No new lookup method is added. `user_id_for` raises IndexError for an unknown email, which only the seed uses after an `account_exists` check, so I left it alone.
  - |
    Sign-up, confirmation and sign-in flows and the demo user seed are out of scope per the story. The only seed-adjacent effect is that `create_confirmed_user` now raises `EmailTaken` instead of a raw IntegrityError. `local_seed.py` guards on `account_exists`/`is_empty` first, so seeding behaviour is unchanged.
estimated_points: 2
package_dependencies: []
notes: |
  ### Data & rollout

  None — no schema, stored-data shape, seed, setting or env var changes. The `users` table already has `email TEXT NOT NULL UNIQUE` and emails are already stored lowercase, so existing rows stay readable. The change only converts a raw database error into the domain `EmailTaken`. It is safe to leave in place and to roll back by reverting the commit.

  Existing behaviour found while reading: `LocalIdentityProvider.sign_up_email` already lowercases and pre-checks `account_exists`, and `/auth/sign-up` maps `IdentityError` to `400 {"code": "could_not_create"}`. `get_identity()` returns the local provider whenever `local_mode` is on, so no DynamoDB accounts table is touched.
review_focus: |
  Hold the change to account storage: only `local_identity.py` and its tests should change, with no new storage backend, routes, settings or seed changes. Most ACs already pass and the tests only pin them. The real fix is that the create_confirmed_user duplicate path raises `EmailTaken` instead of a raw `sqlite3.IntegrityError`. Keeping accounts in SQLite rather than the shared JSON data file is deliberate, because the trip store rewrites that whole file.
