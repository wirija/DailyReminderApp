/* Install/offline enhancement only. Existing session records and navigation stay independent. */
(function (root) {
  'use strict';
  if (!root.location || typeof root.addEventListener !== 'function') return;
  const installButton = document.getElementById('pwa-install');
  const status = document.getElementById('pwa-status');
  const offlineBadge = document.getElementById('pwa-offline');
  const nav = root.navigator || {};
  let installPrompt = null, offlineReady = false, updateWaiting = false, setupFailed = false;
  const standalone = root.matchMedia?.('(display-mode: standalone)');
  const isInstalled = () => Boolean(standalone?.matches || nav.standalone);
  const hosted = /^https?:$/.test(root.location.protocol);
  const secure = hosted && root.isSecureContext === true;

  function renderStatus() {
    if (installButton) installButton.hidden = !installPrompt || isInstalled();
    if (offlineBadge) { offlineBadge.hidden = nav.onLine !== false; offlineBadge.textContent = offlineReady ? 'Offline · cached app' : 'Offline'; }
    if (!status) return;
    if (!hosted) status.textContent = 'Open the app through localhost or HTTPS to enable installation and offline use.';
    else if (!secure) status.textContent = 'Open this address over HTTPS to enable installation and offline use on this computer.';
    else if (setupFailed) status.textContent = (root.PLANNER_SERVER?'Offline setup failed. You can keep using the app online. Check that your changes are saved before reopening.':'Offline setup failed. You can keep using this page. Finish your work before reopening to retry; reopening resets session records.');
    else if (!('serviceWorker' in nav)) status.textContent = 'Offline caching is unavailable in this browser. You can continue using the web app.';
    else if (updateWaiting) status.textContent = (root.PLANNER_SERVER?'App update ready. Once all changes are saved, close all app windows and reopen to update.':'App update ready. Finish your work before closing all app windows. Reopening resets this mockup’s session records.');
    else if (nav.onLine === false) status.textContent = offlineReady ? (root.PLANNER_SERVER?'Offline: app files are available. Connecting to the server is required to load and save records.':'Offline: saved app files are available. Your records are still session-only.') : 'Offline. App files have not finished saving on this device.';
    else if (offlineReady) status.textContent = (root.PLANNER_SERVER?'App files are cached. Records and uploads are stored on your private server and need a connection.':'App files are ready for offline use. Your records are still saved only for this session.');
    else status.textContent = 'Preparing app files for offline use…';
  }

  root.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    renderStatus();
  });
  root.addEventListener('appinstalled', () => { installPrompt = null; renderStatus(); });
  root.addEventListener('online', renderStatus);
  root.addEventListener('offline', renderStatus);
  standalone?.addEventListener?.('change', renderStatus);

  if (installButton) installButton.onclick = async () => {
    if (!installPrompt) return;
    const prompt = installPrompt;
    installPrompt = null;
    installButton.disabled = true;
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch {
      if (status) status.textContent = 'Installation could not start. Use your browser’s Install app menu, or try again when it offers installation.';
    } finally {
      installButton.disabled = false;
      installButton.hidden = !installPrompt || isInstalled();
    }
  };

  function watchRegistration(registration) {
    updateWaiting = Boolean(registration.waiting);
    renderStatus();
    const watchWorker = worker => {
      if (!worker) return;
      const changed = () => {
        if (worker.state === 'installed') updateWaiting = Boolean(nav.serviceWorker.controller);
        if (worker.state === 'redundant') setupFailed = true;
        renderStatus();
      };
      worker.addEventListener('statechange', changed);
      changed();
    };
    watchWorker(registration.installing);
    registration.addEventListener('updatefound', () => watchWorker(registration.installing));
    // Updates wait for existing windows to close. Never reload a session or call skipWaiting.
    nav.serviceWorker.ready.then(ready => {
      if (ready.scope === registration.scope) { offlineReady = true; renderStatus(); }
    }).catch(() => { setupFailed = true; renderStatus(); });
  }

  renderStatus();
  if (!secure || !('serviceWorker' in nav)) return;
  nav.serviceWorker.register('./service-worker.js', { scope: './', updateViaCache: 'none' })
    .then(watchRegistration)
    .catch(() => { setupFailed = true; renderStatus(); });
})(window);
