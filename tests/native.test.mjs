import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { injectionScript } from '../js/autofill/inject.js';
import { loginPayload } from '../js/autofill/bookmarklet.js';
import { PORTALS } from '../js/portals.js';
import * as vault from '../js/vault.js';

const aa = PORTALS.find((p) => p.id === 'american');
const payload = loginPayload(aa, { username: "o'brien", password: 'pa"ss\\word`${x}</script>', extra: {} });

test('the injected script is valid JavaScript and embeds the login exactly, whatever characters it holds', () => {
  const code = injectionScript(payload);
  assert.doesNotThrow(() => new vm.Script(code));
  assert.ok(code.includes(JSON.stringify(payload)));
  assert.deepEqual(JSON.parse(JSON.stringify(payload)), payload);
  assert.equal(payload.p, 'pa"ss\\word`${x}</script>');
});

// A stand-in for the Capacitor runtime and the InAppBrowser plugin. native.js memoizes plugins (Capacitor warns on double registration),
// so there is one stub object whose recorded state is reset for each scenario.
let state = null;
const browser = {
  addListener: async (name, fn) => {
    const entry = { name, fn, removed: false };
    state.listeners.push(entry);
    return { remove: async () => { entry.removed = true; } };
  },
  openWebView: async (opts) => { state.calls.push(['openWebView', opts]); if (state.gate) await state.gate; return { id: `wv${state.calls.length}` }; },
  executeScript: async (opts) => { state.calls.push(['executeScript', opts]); },
};
globalThis.Capacitor = { isNativePlatform: () => true, registerPlugin: (n) => { assert.equal(n, 'InAppBrowser'); return browser; } };

function fakeNative() {
  state = { calls: [], listeners: [] };
  const fire = (name, event) => state.listeners.filter((l) => l.name === name && !l.removed).forEach((l) => l.fn(event));
  return { calls: state.calls, listeners: state.listeners, fire };
}

const load = () => import('../js/inapp.js');

test('opening a portal in the app injects the sign-in script on every page load and on the toolbar button', async () => {
  const n = fakeNative();
  const { openInApp } = await load();
  await openInApp(aa, payload);
  const open = n.calls.find((c) => c[0] === 'openWebView')[1];
  assert.equal(open.url, aa.url);
  assert.equal(open.title, 'American Airlines');
  assert.equal(open.toolbarType, 'navigation');
  assert.ok(open.buttonNearDone, 'toolbar offers a sign-in-again button');

  n.fire('browserPageLoaded', { id: 'wv1' });
  n.fire('browserPageLoaded', { id: 'wv1' });
  n.fire('buttonNearDoneClick', { id: 'wv1' });
  const runs = n.calls.filter((c) => c[0] === 'executeScript');
  assert.equal(runs.length, 3);
  assert.equal(runs[0][1].id, 'wv1');
  assert.ok(runs[0][1].code.includes('runAutofill') || runs[0][1].code.includes('__MYNONREV__'));
  assert.doesNotThrow(() => new vm.Script(runs[0][1].code));
});

test('a page-load that arrives before the open call returns still gets the script', async () => {
  const n = fakeNative();
  let release;
  state.gate = new Promise((r) => { release = r; });
  const { openInApp } = await load();
  const opening = openInApp(aa, payload);
  await new Promise((r) => setImmediate(r));
  n.fire('browserPageLoaded', { id: 'early' });
  release();
  await opening;
  state.gate = null;
  assert.equal(n.calls.filter((c) => c[0] === 'executeScript')[0][1].id, 'early');
});

test('without a saved login the site just opens: nothing is injected and there is no sign-in button', async () => {
  const n = fakeNative();
  const { openInApp } = await load();
  await openInApp(aa, null);
  n.fire('browserPageLoaded', { id: 'wv1' });
  assert.equal(n.calls.filter((c) => c[0] === 'executeScript').length, 0);
  assert.equal(n.calls.find((c) => c[0] === 'openWebView')[1].buttonNearDone, undefined);
});

test('closing the browser, or opening another one, removes the old listeners', async () => {
  const n = fakeNative();
  const { openInApp } = await load();
  await openInApp(aa, payload);
  n.fire('closeEvent', { id: 'wv1' });
  await new Promise((r) => setImmediate(r));
  assert.ok(n.listeners.every((l) => l.removed));

  const before = n.listeners.length;
  await openInApp(aa, payload);
  await openInApp(aa, payload);
  const firstOfSecond = n.listeners.slice(before, before + 3);
  assert.ok(firstOfSecond.every((l) => l.removed), 'listeners from the replaced browser are removed');
});

test('the native copy of the vault follows every write and erase', async () => {
  const mem = new Map();
  vault.useStorage(() => ({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) }));
  vault.erase();
  const seen = [];
  vault.onPersist((text) => { seen.push(text === null ? null : 'blob'); });
  await vault.create('correct horse battery', { iterations: 10_000 });
  await vault.save((d) => { d.autofillKey = 'k'; });
  vault.erase();
  vault.onPersist(null);
  assert.deepEqual(seen, ['blob', 'blob', null]);
});

test('a failing native copy never breaks saving', async () => {
  const mem = new Map();
  vault.useStorage(() => ({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) }));
  vault.erase();
  vault.onPersist(async () => { throw new Error('native storage is down'); });
  await vault.create('correct horse battery', { iterations: 10_000 });
  await vault.save((d) => { d.autofillKey = 'k'; });
  assert.equal(vault.snapshot().autofillKey, 'k');
  vault.onPersist(null);
  vault.erase();
});
