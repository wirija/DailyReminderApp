# Independent PWA review

Reviewer: `/root/pwa_review`, independent of the PWA builder. Reviewed 11 October 2026.

**Verdict: PASS for source and dependency-free behavior verification.** No unresolved Critical, High or Medium finding was identified in the PWA conversion. Actual browser installation, service-worker execution, rendered layout and device-level offline launch remain **unverified** because the earlier browser restriction is still in force. No server, browser, headless process or protocol workaround was run.

## Review scope and evidence

The review covered the actual HTML integration, manifest, generated worker, worker generator, app icons, install/offline client, Python launcher and hosting instructions. It also checked that existing app flows still initialize and operate in the project's inert DOM harness.

| Area | Result | Evidence |
|---|---|---|
| Relative installation identity, start URL and scope | Pass | `docs/manifest.webmanifest`; independent tests resolve URLs at `/`, `/docs/` and `/tools/planner/docs/`. |
| App and maskable icons | Pass | Manifest PNG headers and declared dimensions verified. The maskable icon was visually inspected as a local image; its central calendar/checkmark has generous surrounding space. This is not a browser installation screenshot. |
| Complete offline shell | Pass | Actual install event caches every script/style linked by HTML, manifest icons, favicon, Apple icon and both XLSX templates under all three deployment scopes. `docs/service-worker.js:4`; `scripts/build_pwa.py:27`. |
| Offline known-file and launch behavior | Pass | The worker serves cached app navigation, root navigation, query-bearing app navigation and every required local asset when the fake network fails. Missing cache entries return an actionable 503. `docs/service-worker.js:65`. |
| API, upload and unrelated-page exclusion | Pass | Cross-origin, API, upload, blob and unrelated navigation requests receive no worker response; non-GET requests are ignored. `docs/service-worker.js:67`. |
| Separate deployment caches | Pass | Activation removes only old caches for the exact registered scope and preserves another planner deployment and unrelated applications. `docs/service-worker.js:39`; `docs/service-worker.js:57`. |
| Installation failure and cache recovery | Pass | Failed mandatory precache rejects installation and deletes the incomplete cache. Valid network responses fill cache misses; 404 responses are not stored. `docs/service-worker.js:44`; `docs/service-worker.js:81`. |
| Existing session protection during updates | Pass | No forced activation or reload. Waiting-update text tells users to finish work before closing windows and discloses the reset on reopening. `docs/pwa.js:55`; `docs/service-worker.js:53`. |
| Progressive enhancement and user-triggered installation | Pass | File URLs, insecure HTTP and unsupported browsers keep the page usable. Secure hosting registers a relative worker. The captured install prompt is invoked only by the button and consumed once. Installed windows hide the button. `docs/pwa.js:12`; `docs/pwa.js:29`; `docs/pwa.js:76`. |
| Existing app integration | Pass | Seven existing actual-app inert DOM checks pass: initialization, grouped navigation, global Add task, opportunity editing, action scheduling, project summaries and theme switching. `design-review/tests/app-integration.cjs`. |
| Hosting boundaries and headers | Pass | Actual HTTP handlers exercised with an in-memory connection: six tests cover shell/root routes, all allowed files, HEAD, MIME types, no-cache/nosniff headers and rejection of traversal, review documents, APIs, uploads and directory listings. `scripts/test_pwa_server.py`; `scripts/serve_pwa.py:27`. |
| Build freshness and no new dependencies | Pass | Generator `--check` passes against current assets. Launcher rejects stale worker output. Browser runtime stays local; launcher/generator use Python's standard library. `scripts/build_pwa.py:52`; `scripts/serve_pwa.py:68`. |
| Deployment and persistence instructions | Pass | `PWA.md` distinguishes localhost from a remote host, requires trusted HTTPS for remote installation, describes browser-specific installation, update behavior and session-only records/uploads. |

## Finding and correction

| Severity | Location | Problem | Exact fix | Final status |
|---|---|---|---|---|
| Low | `PWA.md`, offline-use instructions | The instructions initially said “Settings,” while the sidebar says “Connections.” | Replace “Settings → Installed app & offline use” with “Connections → Installed app & offline use.” | Fixed and re-read. |

## Checks run

- `node design-review/tests/pwa-review.cjs`: **24 independent checks pass**, using actual worker/client code and in-memory browser APIs.
- `node design-review/tests/app-integration.cjs`: **7 existing app checks pass**, using the actual script order in an inert DOM.
- `python3 -B scripts/test_pwa_server.py`: **6 handler tests pass**, with no sockets or server process.
- `python3 -B scripts/build_pwa.py --check`: **Pass**, generated worker matches the current asset bytes.

These checks verify code paths and package completeness. They do not establish browser install eligibility, real CacheStorage behavior, browser-specific service-worker lifecycle details, operating-system integration, rendered responsiveness or accessibility conformance. Those remain the next manual verification step when browser access is available.

The PWA conversion does not add durable project storage. That existing limitation is disclosed consistently in the app, `PWA.md` and the requirements record; installing/caching the shell does not preserve records or uploads when the session is closed.
