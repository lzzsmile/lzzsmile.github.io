import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import vm from 'node:vm';

const docs = new URL('../days-matter/', import.meta.url);
const read = name => readFileSync(new URL(name, docs), 'utf8');
const source = read('sw.js');
const html = read('index.html');
const manifest = JSON.parse(read('manifest.webmanifest'));
const release = JSON.parse(read('release.json'));

// Simulate separate registrations using one origin's shared CacheStorage.
// This is a bounded worker test, not a substitute for browser/iOS testing.
function worker(scope, stores = new Map()) {
  const handlers = {};
  const calls = [];
  let offline = false;
  const key = request => new URL(typeof request === 'string' ? request : request.url, scope).href;
  const caches = {
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        async put(request, response) { entries.set(key(request), response.clone()); },
        async match(request) { return entries.get(key(request))?.clone(); },
      };
    },
  };
  const self = {
    location: {origin: new URL(scope).origin},
    registration: {scope},
    addEventListener(type, callback) { handlers[type] = callback; },
    async skipWaiting() {},
    clients: {async claim() {}, async matchAll() { return []; }},
  };
  const context = vm.createContext({self, caches, URL, fetch: async request => {
    calls.push(key(request));
    if (offline) throw new TypeError('offline');
    const url = new URL(key(request));
    const base = new URL(scope).pathname;
    assert.ok(url.pathname.startsWith(base), 'request must remain within the deployment');
    const file = url.pathname.slice(base.length) || 'index.html';
    const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' :
      file.endsWith('.css') ? 'text/css' : file.endsWith('.webmanifest') ? 'application/manifest+json' :
      file.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
    return new Response(readFileSync(new URL(file, docs)), {headers: {'content-type': type}});
  }});
  vm.runInContext(source, context);
  return {
    stores, calls,
    cache: vm.runInContext('CACHE', context),
    prefix: vm.runInContext('CACHE_PREFIX', context),
    shell: [...vm.runInContext('SHELL', context)],
    version: vm.runInContext('VERSION', context),
    offline(value = true) { offline = value; },
    async lifecycle(type) {
      let work;
      handlers[type]({waitUntil(value) { work = value; }});
      assert.ok(work);
      await work;
    },
    async fetch(path, mode = 'cors') {
      let response;
      handlers.fetch({request: {url: new URL(path, scope).href, method: 'GET', mode},
        respondWith(value) { response = value; }});
      return response;
    },
  };
}

test('all shell, manifest and module assets resolve at root and arbitrary GitHub Pages subpaths', () => {
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]).filter(ref => !ref.startsWith('#'));
  refs.push(manifest.id, manifest.start_url, manifest.scope, ...manifest.icons.map(icon => icon.src));
  refs.push(...[...read('app.js').matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1]));
  for (const path of ['/', '/days-matter/', '/team/another-name/']) {
    const scope = `https://account.github.io${path}`;
    const app = worker(scope);
    for (const entry of [scope, `${scope}index.html`, `${scope}?__update=1.2.4#main`]) {
      for (const ref of [...refs, ...app.shell, './sw.js', './release.json']) {
        const resolved = new URL(ref, entry);
        assert.equal(resolved.origin, new URL(scope).origin);
        assert.ok(resolved.pathname.startsWith(path), `${ref} escaped ${path}`);
        const relative = resolved.pathname.slice(path.length) || 'index.html';
        assert.ok(existsSync(new URL(relative, docs)), `missing asset ${relative}`);
      }
    }
  }
});

test('release, HTML, worker and every versioned asset use one deployment version', () => {
  const app = worker('https://account.github.io/days-matter/');
  assert.equal(app.version, release.version);
  assert.equal(html.match(/name="app-version" content="([^"]+)"/)?.[1], release.version);
  for (const asset of app.shell.filter(path => /\.(?:js|css)\?/.test(path))) {
    assert.equal(new URL(asset, 'https://account.github.io/').searchParams.get('v'), release.version);
    if (!asset.includes('calendar.js')) assert.ok(html.includes(asset), `${asset} is not loaded by HTML`);
  }
  assert.ok(read('app.js').includes(`./calendar.js?v=${release.version}`));
});

test('two deployed projects keep independent offline shells through install and activation', async () => {
  const stores = new Map();
  const first = worker('https://account.github.io/first/', stores);
  const second = worker('https://account.github.io/second/', stores);
  assert.notEqual(first.cache, second.cache);
  await first.lifecycle('install');
  stores.set(first.prefix + '0.0.0', new Map());
  stores.set(second.prefix + '0.0.0', new Map());
  await second.lifecycle('install');
  await second.lifecycle('activate');
  assert.ok(stores.has(first.cache));
  assert.ok(stores.has(first.prefix + '0.0.0'), 'another project owns its old cache');
  assert.equal(stores.has(second.prefix + '0.0.0'), false);
  for (const app of [first, second]) {
    app.offline();
    for (const entry of ['./', './index.html', './?__update=1.2.4']) {
      assert.equal(await (await app.fetch(entry, 'navigate')).text(), html);
    }
    const before = app.calls.length;
    for (const asset of app.shell.filter(path => path !== './' && path !== './index.html')) {
      assert.equal((await app.fetch(asset)).ok, true, `${asset} must be cached`);
    }
    assert.equal(app.calls.length, before, 'offline assets must not require the network');
  }
});

test('a failed fresh install cannot erase another project at the same app version', async () => {
  const stores = new Map();
  const first = worker('https://account.github.io/working/', stores);
  const second = worker('https://account.github.io/new-copy/', stores);
  await first.lifecycle('install');
  second.offline();
  await assert.rejects(second.lifecycle('install'), /offline/);
  assert.ok(stores.has(first.cache));
  assert.equal(stores.has(second.cache), false);
  first.offline();
  assert.equal(await (await first.fetch('./', 'navigate')).text(), html);
});
