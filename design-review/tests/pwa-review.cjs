'use strict';
/* Independent PWA behavior review. In-memory browser APIs only; no browser/server/network. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const docs = path.resolve(__dirname, '../../docs');
const html = fs.readFileSync(path.join(docs, 'mockup.html'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(docs, 'manifest.webmanifest'), 'utf8'));
const workerSource = fs.readFileSync(path.join(docs, 'service-worker.js'), 'utf8');
const clientSource = fs.readFileSync(path.join(docs, 'pwa.js'), 'utf8');
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log('PASS independent PWA: ' + name); }
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

function workerHarness(scope, failAsset = '') {
  const handlers = new Map(), stores = new Map(), requested = [];
  let offline = false, claims = 0;
  const normalized = value => typeof value === 'string' ? value : value.url;
  const fakeFetch = async request => {
    const url = normalized(request); requested.push(url);
    if (offline) throw Error('Simulated offline');
    const name = decodeURIComponent(new URL(url).pathname.slice(new URL(scope).pathname.length));
    const file = path.join(docs, name);
    const response = new Response(name === failAsset || !fs.existsSync(file) ? 'Not found' : fs.readFileSync(file), { status: name === failAsset || !fs.existsSync(file) ? 404 : 200 });
    Object.defineProperties(response, { type: { value: 'basic' }, url: { value: url } });
    return response;
  };
  const caches = {
    async open(name) {
      if (!stores.has(name)) {
        const records = new Map();
        stores.set(name, {
          records,
          async addAll(requests) {
            const responses = await Promise.all(requests.map(fakeFetch));
            if (responses.some(response => !response.ok)) throw Error('Precache response failed');
            requests.forEach((request, i) => records.set(normalized(request), responses[i].clone()));
          },
          async match(request) { return records.get(normalized(request))?.clone(); },
          async put(request, response) { records.set(normalized(request), response.clone()); }
        });
      }
      return stores.get(name);
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); }
  };
  const self = { registration: { scope }, location: new URL('service-worker.js', scope), clients: { async claim() { claims++; } }, addEventListener(type, handler) { handlers.set(type, handler); }, skipWaiting() { throw Error('Updates must not force activation'); } };
  const context = vm.createContext({ self, caches, URL, Request, Response, fetch: fakeFetch, console });
  vm.runInContext(workerSource, context, { filename: 'actual-service-worker.js' });
  return {
    stores, requested, caches,
    get claims() { return claims; },
    set offline(value) { offline = value; },
    async lifecycle(type) { let promise; handlers.get(type)({ waitUntil(value) { promise = value; } }); assert(promise, type + ' must keep lifecycle work alive'); await promise; },
    async fetch(url, options = {}) { let response; handlers.get('fetch')({ request: { url, method: options.method || 'GET', mode: options.mode || 'cors' }, respondWith(value) { response = value; } }); return response ? await response : null; },
    shell() { return vm.runInContext('Array.from(shellURLs)', context); },
    cacheName() { return vm.runInContext('CACHE_NAME', context); }
  };
}

function clientHarness({ protocol = 'https:', secure = true, installed = false, waiting = false, failure = false, supported = true } = {}) {
  const elements = new Map(['pwa-install', 'pwa-status', 'pwa-offline'].map(id => [id, { hidden: true, disabled: false, textContent: '' }]));
  const events = new Map(), registrationEvents = new Map(), calls = [];
  let reloads = 0;
  const scope = 'https://example.test/company/planner/docs/';
  const registration = { scope, waiting: waiting ? {} : null, installing: null, addEventListener(name, fn) { registrationEvents.set(name, fn); } };
  const serviceWorker = { controller: waiting ? {} : null, ready: Promise.resolve(registration), register(...args) { calls.push(args); return failure ? Promise.reject(Error('Denied')) : Promise.resolve(registration); } };
  const root = { location: { protocol, reload() { reloads++; } }, isSecureContext: secure, navigator: { onLine: true, ...(supported ? { serviceWorker } : {}) }, matchMedia: () => ({ matches: installed, addEventListener() {} }), addEventListener(name, fn) { events.set(name, fn); } };
  const document = { getElementById: id => elements.get(id) || null };
  vm.runInNewContext(clientSource, { window: root, document, console }, { filename: 'actual-pwa-client.js' });
  return { elements, events, calls, root, get reloads() { return reloads; }, fire(type, event = {}) { return events.get(type)?.(event); } };
}

(async () => {
  await test('manifest launch, identity, scope and icon paths resolve at arbitrary hosting depths', () => {
    assert.equal(manifest.display, 'standalone');
    for (const scope of ['https://example.test/', 'https://example.test/docs/', 'https://example.test/tools/planner/docs/']) {
      const url = new URL('manifest.webmanifest', scope);
      assert.equal(new URL(manifest.scope, url).href, scope);
      assert.equal(new URL(manifest.start_url, url).href, new URL('mockup.html', scope).href);
      assert(new URL(manifest.id, url).href.startsWith(scope));
      for (const icon of manifest.icons) assert(new URL(icon.src, url).href.startsWith(scope));
    }
    assert(manifest.icons.some(icon => icon.sizes === '192x192' && icon.purpose === 'any'));
    assert(manifest.icons.some(icon => icon.sizes === '512x512' && icon.purpose === 'any'));
    assert(manifest.icons.some(icon => icon.purpose === 'maskable'));
  });
  await test('manifest icon files are real PNGs of their declared dimensions', () => {
    for (const icon of manifest.icons) {
      const bytes = fs.readFileSync(path.join(docs, icon.src));
      assert.deepEqual(bytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      assert.equal(bytes.toString('ascii', 12, 16), 'IHDR');
      assert.equal(bytes.readUInt32BE(16) + 'x' + bytes.readUInt32BE(20), icon.sizes);
    }
  });
  const required = new Set(['mockup.html', 'manifest.webmanifest', 'templates/PBC-template.xlsx', 'templates/Issue-template.xlsx', ...manifest.icons.map(icon => icon.src)]);
  for (const tag of html.matchAll(/<(script|link)\b([^>]+)>/gi)) {
    const attrs = Object.fromEntries([...tag[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(match => [match[1], match[2]]));
    if (tag[1].toLowerCase() === 'script' && attrs.src) required.add(attrs.src.replace(/^\.\//, ''));
    if (tag[1].toLowerCase() === 'link' && ['stylesheet', 'manifest', 'icon', 'apple-touch-icon'].includes(attrs.rel)) required.add(attrs.href.replace(/^\.\//, ''));
  }
  await test('actual HTML links the manifest and the PWA enhancement without remote runtime assets', () => {
    assert(/<link\b[^>]*rel="manifest"[^>]*href="(?:\.\/)?manifest\.webmanifest"/.test(html));
    assert(/<script\b[^>]*src="(?:\.\/)?pwa\.js"/.test(html));
    assert(html.includes('id="pwa-install"')); assert(html.includes('id="pwa-status"')); assert(html.includes('id="pwa-offline"'));
    for (const name of required) { assert(!/^(https?:|\/)/.test(name)); assert(fs.existsSync(path.join(docs, name)), name + ' exists'); }
  });
  for (const scope of ['https://example.test/', 'https://example.test/docs/', 'https://example.test/tools/planner/docs/']) {
    const worker = workerHarness(scope);
    await test('complete shell precache works at ' + new URL(scope).pathname, async () => {
      await worker.lifecycle('install');
      const cache = await worker.caches.open(worker.cacheName());
      for (const name of required) assert(await cache.match(new URL(name, scope).href), 'Offline shell missing ' + name);
      assert.equal(cache.records.size, worker.shell().length);
      assert(worker.shell().every(url => new URL(url).pathname.startsWith(new URL(scope).pathname)));
    });
    await test('offline launch and every required local asset are served at ' + new URL(scope).pathname, async () => {
      worker.offline = true;
      for (const name of required) { const response = await worker.fetch(new URL(name, scope).href, { mode: name === 'mockup.html' ? 'navigate' : 'cors' }); assert(response?.ok, name + ' is available offline'); }
      assert((await worker.fetch(scope, { mode: 'navigate' })).ok);
      assert((await worker.fetch(new URL('mockup.html?view=projects', scope).href, { mode: 'navigate' })).ok);
      assert.equal(worker.requested.length, worker.shell().length, 'Offline cache hits must not start network fetches');
    });
    await test('API, uploads, unrelated paths and non-GET traffic bypass worker at ' + new URL(scope).pathname, async () => {
      for (const url of ['https://ollama.example.test/api/chat', new URL('api/projects', scope).href, new URL('uploads/meeting.docx', scope).href, 'blob:https://example.test/example-id', new URL('other.html', scope).href]) assert.equal(await worker.fetch(url, { mode: 'navigate' }), null, url);
      assert.equal(await worker.fetch(new URL('mockup.html', scope).href, { method: 'POST' }), null);
    });
    await test('activation removes only old caches for this exact deployment at ' + new URL(scope).pathname, async () => {
      const prefix = worker.cacheName().slice(0, worker.cacheName().lastIndexOf(':') + 1);
      const old = prefix + 'obsolete';
      const other = 'daily-planner:https://example.test/another-deployment/docs/:obsolete';
      await worker.caches.open(old); await worker.caches.open(other); await worker.caches.open('unrelated-app-v1');
      await worker.lifecycle('activate');
      assert(!worker.stores.has(old)); assert(worker.stores.has(other)); assert(worker.stores.has('unrelated-app-v1')); assert(worker.stores.has(worker.cacheName())); assert.equal(worker.claims, 1);
    });
  }
  await test('a failed mandatory precache rolls back its incomplete cache and fails install', async () => {
    const worker = workerHarness('https://example.test/docs/', 'templates/Issue-template.xlsx');
    await assert.rejects(() => worker.lifecycle('install'), /Precache response failed/);
    assert.equal(worker.stores.size, 0);
  });
  await test('a missing allowlisted file returns a clear offline error without caching it', async () => {
    const scope = 'https://example.test/docs/', worker = workerHarness(scope);
    worker.offline = true;
    const response = await worker.fetch(new URL('mockup.html', scope).href, { mode: 'navigate' });
    assert.equal(response.status, 503); assert((await response.text()).includes('Reconnect'));
    const cache = await worker.caches.open(worker.cacheName()); assert.equal(cache.records.size, 0);
  });
  await test('an online cache miss stores a valid same-origin asset for later offline use', async () => {
    const scope = 'https://example.test/docs/', worker = workerHarness(scope), url = new URL('client-picker.js', scope).href;
    assert((await worker.fetch(url)).ok);
    worker.offline = true;
    assert((await worker.fetch(url)).ok);
    assert.equal(worker.requested.length, 1);
  });
  await test('an online missing-file response is returned without poisoning the offline cache', async () => {
    const scope = 'https://example.test/docs/', worker = workerHarness(scope, 'client-picker.js'), url = new URL('client-picker.js', scope).href;
    assert.equal((await worker.fetch(url)).status, 404);
    const cache = await worker.caches.open(worker.cacheName()); assert.equal(cache.records.size, 0);
    worker.offline = true; assert.equal((await worker.fetch(url)).status, 503);
  });
  await test('file URLs and insecure remote HTTP never register service workers', async () => {
    for (const options of [{ protocol: 'file:', secure: false }, { protocol: 'http:', secure: false }]) {
      const client = clientHarness(options); await flush(); assert.equal(client.calls.length, 0);
      assert(/localhost|HTTPS/.test(client.elements.get('pwa-status').textContent)); assert.equal(client.elements.get('pwa-install').hidden, true);
    }
  });
  await test('secure hosting registers a relative scoped worker and communicates session-only storage', async () => {
    const client = clientHarness(); await flush();
    assert.equal(client.calls.length, 1); assert.equal(client.calls[0][0], './service-worker.js'); assert.equal(client.calls[0][1].scope, './'); assert.equal(client.calls[0][1].updateViaCache, 'none');
    assert(/session/.test(client.elements.get('pwa-status').textContent));
    client.root.navigator.onLine = false; client.fire('offline'); assert.equal(client.elements.get('pwa-offline').hidden, false); assert(/Offline/.test(client.elements.get('pwa-status').textContent));
    client.root.navigator.onLine = true; client.fire('online'); assert.equal(client.elements.get('pwa-offline').hidden, true);
  });
  await test('installation is user-triggered, single-use and hidden for installed windows', async () => {
    const client = clientHarness(); await flush(); let prompts = 0, prevented = 0;
    client.fire('beforeinstallprompt', { preventDefault() { prevented++; }, async prompt() { prompts++; }, userChoice: Promise.resolve({ outcome: 'dismissed' }) });
    const button = client.elements.get('pwa-install'); assert.equal(prevented, 1); assert.equal(prompts, 0); assert.equal(button.hidden, false);
    await button.onclick(); assert.equal(prompts, 1); assert.equal(button.disabled, false); assert.equal(button.hidden, true); await button.onclick(); assert.equal(prompts, 1);
    const installed = clientHarness({ installed: true }); installed.fire('beforeinstallprompt', { preventDefault() {}, prompt() { throw Error('Should not prompt'); } }); assert.equal(installed.elements.get('pwa-install').hidden, true);
  });
  await test('waiting updates never reload existing sessions and warn about reopening', async () => {
    const client = clientHarness({ waiting: true }); await flush();
    const text = client.elements.get('pwa-status').textContent;
    assert(/update ready/.test(text)); assert(/closing all app windows/.test(text)); assert(/resets/.test(text)); assert.equal(client.reloads, 0);
  });
  await test('unsupported browsers and registration failures leave an actionable page', async () => {
    const unsupported = clientHarness({ supported: false }); await flush(); assert.equal(unsupported.calls.length, 0); assert(/continue using/.test(unsupported.elements.get('pwa-status').textContent));
    const failed = clientHarness({ failure: true }); await flush(); assert(/setup failed/.test(failed.elements.get('pwa-status').textContent)); assert(/keep using/.test(failed.elements.get('pwa-status').textContent)); assert.equal(failed.reloads, 0);
  });
  console.log('\n' + passed + ' independent PWA checks passed. Install prompts, service-worker lifecycle, layout and offline launch in a real browser remain unverified.');
})().catch(error => { console.error(error); process.exitCode = 1; });
