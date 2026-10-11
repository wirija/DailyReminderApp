# Daily Project Planner PWA

The planner has an app manifest, app icons, an optional **Install app** button and an offline cache of its HTML, scripts, styles and spreadsheet templates.

**Working application:** use the Django server at `/app/` for authentication and permanent database records. See [README.md](README.md) and [DEPLOYMENT.md](DEPLOYMENT.md). The standalone launcher below is the original sample preview only.

## Open and install on this computer

From the project folder, run this command with Python 3.9 or newer:

```sh
python3 scripts/serve_pwa.py
```

Open [Daily Project Planner](http://localhost:8765/mockup.html). Keep that command running while you use the hosted app. Stop it with **Ctrl+C**.

- **Chrome or Edge:** use the browser's Install app option, or the app's **Install app** button when the browser offers it.
- **Safari on macOS Sonoma or later:** use **File → Add to Dock**. The custom Install app button is hidden when the browser does not support that prompt.

Install availability depends on the browser. Opening `docs/mockup.html` directly with a `file://` address still works as a preview, but installation and service workers require **HTTPS or localhost/127.0.0.1**. [MDN: Making PWAs installable](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)

## Host on the MacBook or Dell for access from another computer

`localhost` refers to the computer where the browser is running. To use the app from a work computer while the server runs on another machine, serve the complete `docs/` app over HTTPS, using a certificate trusted by that work computer. A plain HTTP server address on the local network does not provide the secure context needed for the PWA. [MDN: Making PWAs installable](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)

Use an existing HTTPS web server/reverse proxy, or provide your certificate and key to the included launcher:

```sh
python3 scripts/serve_pwa.py --host 0.0.0.0 --port 8765 --cert /path/to/certificate.pem --key /path/to/private-key.pem
```

Open `https://YOUR-SERVER-HOSTNAME:8765/mockup.html`, replacing the hostname with the one covered by your certificate. Certificate and network setup are managed by you. The launcher exposes only the app's listed runtime files; it does not serve the repository, review documents or uploaded documents.

For deployment under an existing subdirectory, keep the app files together. For example, `/planner/mockup.html`, `/planner/manifest.webmanifest` and `/planner/service-worker.js` must remain siblings. All app URLs and cache scopes are relative to that deployment.

## Offline use and records

After the first successful hosted visit, **Connections → Installed app & offline use** reports when the app files are ready offline. Once ready, the same address or installed app can open without a network connection. The app shows an Offline badge when the browser reports no connection.

**Standalone preview:** records and uploads last only for the current mockup session. Installing that preview does not make them permanent.

**Django application at `/app/`:** records and uploads are saved to the server and survive reopening. The offline cache holds only shipped app files, never client uploads, board/API responses or AI responses. You need a connection to load private records. Changes made during a temporary outage remain in the open tab; retry saving after reconnecting and wait for **All changes saved** before closing. Durable offline record editing is not implemented.

## Updates

New app versions download in the background and wait for existing app windows and tabs to close. There is no automatic refresh that could discard your current work. Finish saving before closing; reopening lets the new app version activate and loads your saved server records.

After changing the HTML, runtime scripts, styles, icons, manifest or templates, rebuild the asset list and content version:

```sh
python3 scripts/build_pwa.py
python3 scripts/build_pwa.py --check
```

The launcher refuses to serve an outdated generated worker, so missing offline assets are caught before startup.

## Verification

The dependency-free checks cover manifest/icon validity, every local offline asset, offline navigation, separate deployment caches, failed-cache rollback, safe update behavior and preservation of existing app flows. Run them with Node:

```sh
node design-review/tests/run.cjs
```

Actual browser installation, rendered layout and device-level offline behavior were not verified in this session because browser execution was restricted. The independent review tests emulate service-worker events and browser APIs; they are not a substitute for an installed-browser check.
