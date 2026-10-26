summary: |
  Add one command, `pnpm start` from the repo root, that checks the two local ports, then starts the Trip Planner API (uvicorn, local mode on) and the Web App (vite dev server) together, already wired: the API gets the local-mode and cookie env, and the web dev server proxies every API path to the API origin so the browser only ever talks to the web origin. Because the browser sees one origin, the HttpOnly `SameSite=Lax` session cookie is kept and survives a reload with `COOKIE_SECURE=false`. If either port is busy, nothing is started, the command exits non-zero and the message names the busy port(s). No Docker and no cloud emulators.
scope:
  - description: |
      Port pre-flight, in a small testable module. Both ports are probed BEFORE any child process is spawned, and every busy port is reported (not just the first).
      ```js
      // scripts/ports.mjs
      export async function isPortFree(port, host = '127.0.0.1') // resolves boolean, via net.createServer().listen
      export async function findBusyPorts(ports /* [{ name, port }] */) // -> [{ name, port }]
      export function busyPortMessage(busy) // "Port 8000 (API) is already in use. Stop whatever is using it, or set API_PORT to another port."
      ```
    files:
      - scripts/ports.mjs
    rationale: |
      AC4, AC5, AC6. Checking first (and keeping vite on `--strictPort`) guarantees neither app starts when a port is busy, instead of vite silently moving to another port and breaking the wiring.
  - description: |
      The launcher. Reads `API_PORT` (default 8000) and `WEB_PORT` (default 5173). Order: (1) `findBusyPorts`; if any, print `busyPortMessage` to stderr and `process.exit(1)` with nothing spawned. (2) First-run setup for a clean checkout, idempotent: `pnpm install --frozen-lockfile` in apps/web when node_modules is missing; create `services/api/.venv` and `pip install -r requirements.txt` when it is missing. (3) Spawn the API with `.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port $API_PORT` in services/api, env `LOCAL_MODE=true`, `APP_ENV=local`, `COOKIE_SECURE=false`, `WEB_ORIGIN=http://localhost:$WEB_PORT`, and `SESSION_SECRET` set to a random value generated per start (never read from or written to a file). (4) Spawn `pnpm exec vite --host 127.0.0.1 --port $WEB_PORT --strictPort` in apps/web with `API_ORIGIN=http://127.0.0.1:$API_PORT`. (5) Wait for the API `/health` and the web port, print the two URLs. If either child exits, stop the other and exit non-zero; forward SIGINT/SIGTERM to both children.
      ```js
      // scripts/start.mjs
      export function buildPlan(env) // -> { apiPort, webPort, api: { cmd, args, cwd, env }, web: { cmd, args, cwd, env } }  (pure, unit-tested)
      ```
      Root package.json (new, private, no dependencies):
      ```json
      { "name": "trip-planner", "private": true,
        "scripts": { "start": "node scripts/start.mjs",
                     "test": "node --test scripts/",
                     "test:start": "node --test scripts/start.integration.test.mjs" } }
      ```
    files:
      - package.json
      - scripts/start.mjs
    rationale: |
      AC1, and the API half of AC2 and AC3. Node 22 is already pinned in `.tool-versions`, so a Node launcher needs no new tool or dependency; it avoids a shell script that would not run the same on every developer machine. Local mode, `APP_ENV=local` and `COOKIE_SECURE=false` are the existing settings from `app/config.py` and `app/local_mode.py`; the secret is random per start because local data is in-memory anyway.
  - description: |
      Web-to-API wiring. The dev server currently proxies only `/auth`, but the web app also fetches `/trips`, `/places`, `/saved-places`, `/profile`, `/shared`, `/invites`, `/transport` and `/startup-status`. Extract the proxy table into a testable module and use it from vite.config.ts. Several API prefixes (`/trips`, `/places`, `/shared`, `/invites`) are also client-side routes, so a browser page load or reload of those URLs must still get index.html: bypass the proxy when the request accepts `text/html`, except under `/auth` (the Google sign-in redirect is a real navigation to the API).
      ```ts
      // apps/web/src/devProxy.ts
      export const API_PREFIXES = ['/auth', '/trips', '/places', '/saved-places', '/profile', '/shared', '/invites', '/transport', '/startup-status', '/health']
      export function pageRequestBypass(req: { url?: string; headers: { accept?: string } }): string | undefined
        // '/index.html' for a text/html navigation outside /auth, else undefined
      export function apiProxy(apiOrigin: string): Record<string, ProxyOptions>
      ```
      vite.config.ts: `server: { proxy: apiProxy(process.env.API_ORIGIN ?? 'http://localhost:8000') }`. The browser keeps using relative URLs and `credentials: 'same-origin'` exactly as today; no fetch call site changes.
    files:
      - apps/web/src/devProxy.ts
      - apps/web/vite.config.ts
    rationale: |
      AC2 and AC3. Proxying keeps one origin, so no manual address config, no CORS, and the existing `SameSite=Lax` HttpOnly cookie (app/routers/auth.py) is stored and re-sent on reload without any cookie change on the API. A cross-origin split (5173 to 8000) would need CORS plus credentialed fetches in every api.ts; this avoids that.
  - description: |
      Docs: add a "Run it locally" section to services/api/README.md (the repo has no root README): the one command, the two default ports and `API_PORT`/`WEB_PORT` overrides, what the command sets (`LOCAL_MODE`, `APP_ENV`, `COOKIE_SECURE`, `WEB_ORIGIN`, per-start `SESSION_SECRET`), the demo sign-in, and the busy-port behaviour. Add a root README.md with the same two-line quick start pointing there.
    files:
      - services/api/README.md
      - README.md
    rationale: Settings and their defaults must be documented where the existing settings table lives.
tests:
  - |
    AC4/AC5/AC6 (write first, scripts/ports.test.mjs, node:test). Occupy a port with a real listener, then:
    ```js
    const srv = net.createServer().listen(0, '127.0.0.1'); const { port } = srv.address()
    assert.equal(await isPortFree(port), false)
    assert.deepEqual(await findBusyPorts([{ name: 'API', port }, { name: 'Web', port: freePort }]), [{ name: 'API', port }])
    assert.match(busyPortMessage([{ name: 'API', port }]), new RegExp(`Port ${port}`))
    ```
  - |
    AC4/AC5/AC6 end to end (scripts/start.integration.test.mjs). With a listener holding the API port, run `node scripts/start.mjs` with `API_PORT`/`WEB_PORT` set to that port and a free one. Repeat holding the web port.
    ```js
    assert.equal(result.status, 1)                                  // AC5, non-zero exit
    assert.match(result.stderr, new RegExp(`Port ${busyPort}`))     // AC6, names the busy port
    assert.equal(await isPortFree(otherPort), true)                 // AC4, the other app was not started
    ```
  - |
    AC1 (scripts/start.test.mjs, pure `buildPlan`): the plan holds both processes and the wiring.
    ```js
    const p = buildPlan({ API_PORT: '9100', WEB_PORT: '9200' })
    assert.deepEqual(p.api.args.slice(-2), ['--port', '9100'])
    assert.equal(p.api.env.LOCAL_MODE, 'true'); assert.equal(p.api.env.APP_ENV, 'local')
    assert.equal(p.api.env.COOKIE_SECURE, 'false')
    assert.equal(p.api.env.WEB_ORIGIN, 'http://localhost:9200')
    assert.equal(p.web.env.API_ORIGIN, 'http://127.0.0.1:9100')
    assert.ok(p.web.args.includes('--strictPort'))
    assert.notEqual(buildPlan({}).api.env.SESSION_SECRET, buildPlan({}).api.env.SESSION_SECRET)
    ```
    plus an integration case that runs the real command on free ports and asserts `GET http://127.0.0.1:$WEB_PORT/health` returns 200 (the API is up) and the web root returns HTML.
  - |
    AC2 (apps/web/src/devProxy.test.ts, vitest). Every path the web app fetches is proxied to the given origin, with no per-address config:
    ```ts
    const proxy = apiProxy('http://127.0.0.1:9100')
    for (const p of ['/auth', '/trips', '/places', '/saved-places', '/profile', '/shared', '/invites', '/transport', '/startup-status'])
      expect(proxy[p].target).toBe('http://127.0.0.1:9100')
    expect(pageRequestBypass({ url: '/trips/abc', headers: { accept: 'text/html,*/*' } })).toBe('/index.html')
    expect(pageRequestBypass({ url: '/trips', headers: { accept: '*/*' } })).toBeUndefined()
    expect(pageRequestBypass({ url: '/auth/google', headers: { accept: 'text/html' } })).toBeUndefined()
    ```
    plus, in the integration test, `GET web/startup-status` through the web port returns the API's JSON with `local_mode: true` and a `demo_account`.
  - |
    AC3 (integration, scripts/start.integration.test.mjs). Through the WEB port only: POST `/auth/sign-in` with the demo account, read the `set-cookie` header, replay it as a reload would, and confirm the session survives.
    ```js
    const signIn = await fetch(`${web}/auth/sign-in`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'demo@example.com', password: 'demo-password-1' }) })
    const cookie = signIn.headers.get('set-cookie')
    assert.match(cookie, /session=/); assert.doesNotMatch(cookie, /;\s*secure/i)   // browser accepts it on http
    const me = await fetch(`${web}/auth/me`, { headers: { cookie: cookie.split(';')[0] } })
    assert.equal(me.status, 200)
    ```
  - |
    AC3, API side (services/api/tests/unit/test_auth_router.py, pytest): with the settings the launcher sets (`COOKIE_SECURE=false`), the cookie has no `Secure` attribute but is still HttpOnly and Lax, so a plain-http browser keeps it.
    ```python
    header = r.headers["set-cookie"].lower()
    assert "secure" not in header and "httponly" in header and "samesite=lax" in header
    ```
assumptions_or_open_questions:
  - |
    The one command is `pnpm start` run from the repo root. The repo has no root package.json today, so this adds a dependency-free one. Say if you would rather have `make start` or a shell script.
  - |
    Same-origin proxy through vite was chosen over CORS plus credentialed cross-origin fetches, so no API CORS middleware and no web fetch changes are needed. The cost is that this wiring only exists in the dev server, not in `vite preview`, which is fine for this story.
  - |
    Default ports are 8000 (API, matching the existing `API_ORIGIN` fallback in vite.config.ts) and 5173 (vite default). They are overridable with `API_PORT` and `WEB_PORT`. The pre-flight probes 127.0.0.1 only.
  - |
    The API installs from services/api/requirements.txt with pip into services/api/.venv (the confirmed stack says pip; the setup.yaml `uv add` command is only for adding packages, and no packages are added here). run-py.sh already prefers `.venv/bin/python`.
  - |
    Launcher tests use Node's built-in `node --test`, so the root needs no test dependency; the Web App unit test for the proxy table uses the project's vitest. The integration tests need the API venv and the web node_modules, so they run under `pnpm test:start`, not the default `pnpm test`.
  - |
    Importing src/devProxy.ts from vite.config.ts assumes the web tsconfig for node files allows it; if `tsc -b` objects, move the module next to vite.config.ts and widen the vitest include.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout

  - **Existing data**: None. No schema, stored data or migration changes; local data is in-memory (see README, Demo account).
  - **Backfill / seed**: None added. The existing first-start demo seed (`app/local_seed.py`, called from `lifespan` in `app/main.py`) runs unchanged when the API starts in local mode.
  - **Settings**: No new API settings. The launcher sets existing ones (`LOCAL_MODE=true`, `APP_ENV=local`, `COOKIE_SECURE=false`, `WEB_ORIGIN`, `SESSION_SECRET`) for its child process only. New launcher-only variables `API_PORT` (default 8000) and `WEB_PORT` (default 5173) are documented in services/api/README.md and README.md. Unset, the defaults apply and a deployed API is untouched, because `COOKIE_SECURE` still defaults to `true` and local mode still defaults to off.
  - **Provisioning**: None; no cloud resources, no Docker. A clean checkout needs Node 22, pnpm and Python 3.12 (`.tool-versions`); the launcher installs dependencies on first run.
  - **Order and rollback**: Purely additive developer tooling. Roll back by deleting the root package.json and scripts/ and reverting vite.config.ts.

  ```mermaid
  flowchart TD
    Dev[developer: pnpm start] --> Start[scripts/start.mjs]
    Start -->|pre-flight, exit 1 on busy port| Ports[scripts/ports.mjs]
    Start -->|spawn, local env| Uvicorn[app.main:app]
    Start -->|spawn, API_ORIGIN| Vite[apps/web/vite.config.ts]
    Vite -->|proxy table| Proxy[apps/web/src/devProxy.ts]
    Proxy -->|same-origin requests| Uvicorn
    Uvicorn --> Cfg[app/config.py + app/local_mode.py]
    Uvicorn --> Seed[app/local_seed.py]
    Uvicorn --> Auth[app/routers/auth.py session cookie]
    classDef touched fill:#f96,color:#000
    class Start,Ports,Vite,Proxy touched
  ```

  Orange nodes are new or modified here; the API side is read-only context (its existing settings and cookie behaviour are reused as-is). The only API-side change is one extra unit test.

  Why a proxy prefix list and not a `/api` prefix: the API has no prefix and the web app fetches bare paths in several api.ts files, so a prefix would touch every call site. The `text/html` bypass is what stops a reload of a client route such as `/trips/abc` from being sent to the API.
review_focus: |
  IN scope: root launcher (port pre-flight, env wiring, first-run setup), the vite proxy table with the HTML-navigation bypass, README docs, and tests. OUT: Docker, cloud emulators, CORS, any change to API sessions or web fetch call sites. Riskiest area is the proxy bypass (a reload of `/trips/...` must serve the app, while `/auth/*` navigations such as Google sign-in must still reach the API) and the guarantee that a busy port means no child process is spawned. The per-start random `SESSION_SECRET` and `COOKIE_SECURE=false` are deliberate, set only for the launcher's child process.
