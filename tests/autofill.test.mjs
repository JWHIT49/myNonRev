import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {
  CODE_PREFIX, CODE_TTL_MS, newAutofillKey, sealLoginCode, openLoginCode, loginPayload, bookmarkletSource, bookmarkletUrl,
} from '../js/autofill/bookmarklet.js';
import { PORTALS } from '../js/portals.js';

// openLoginCode runs in the airline page, so give it the browser globals it reads from window.
globalThis.window = globalThis;

const creds = { username: 'jdoe', password: 'S3cret-pw!', extra: { airline: 'Republic Airline' } };
const myid = PORTALS.find((p) => p.id === 'myidtravel');

test('a sealed login code opens with the same key', async () => {
  const key = newAutofillKey();
  const code = await sealLoginCode(key, loginPayload(myid, creds));
  assert.ok(code.startsWith(CODE_PREFIX));
  const payload = await openLoginCode(code, key);
  assert.equal(payload.u, 'jdoe');
  assert.equal(payload.p, 'S3cret-pw!');
  assert.deepEqual(payload.extra, { label: 'Employing Airline', match: 'airline|employing', value: 'Republic Airline' });
});

test('the clipboard code never contains the credentials in readable form', async () => {
  const code = await sealLoginCode(newAutofillKey(), loginPayload(myid, creds));
  for (const secret of ['jdoe', 'S3cret', 'Republic']) assert.ok(!code.includes(secret));
  const decodedGuess = Buffer.from(code.slice(CODE_PREFIX.length), 'base64url').toString('latin1');
  assert.ok(!decodedGuess.includes('S3cret'));
});

test('a code made with a different key is refused', async () => {
  const code = await sealLoginCode(newAutofillKey(), loginPayload(myid, creds));
  await assert.rejects(openLoginCode(code, newAutofillKey()), /different autofill key/);
});

test('a code expires after five minutes', async () => {
  const key = newAutofillKey();
  const now = Date.now();
  const code = await sealLoginCode(key, loginPayload(myid, creds), now);
  await openLoginCode(code, key, now + CODE_TTL_MS - 1000);
  await assert.rejects(openLoginCode(code, key, now + CODE_TTL_MS + 1000), /expired/);
});

test('a tampered or foreign code is refused', async () => {
  const key = newAutofillKey();
  const code = await sealLoginCode(key, loginPayload(myid, creds));
  await assert.rejects(openLoginCode(`${code.slice(0, -4)}AAAA`, key), /different autofill key/);
  await assert.rejects(openLoginCode('hunter2', key), /not a myNonRev login code/);
});

test('every code is unique even for the same login', async () => {
  const key = newAutofillKey();
  const a = await sealLoginCode(key, loginPayload(myid, creds));
  const b = await sealLoginCode(key, loginPayload(myid, creds));
  assert.notEqual(a, b);
});

test('loginPayload carries the portal steps and only includes the extra field when a value is saved', () => {
  const aa = PORTALS.find((p) => p.id === 'american');
  const p = loginPayload(aa, { username: 'u', password: 'p', extra: {} });
  assert.equal(p.nav.length, 2);
  assert.equal(p.done, 'travelplanner\\.etp\\.aa\\.com');
  assert.equal(p.extra, null);
  assert.equal(loginPayload(myid, { username: 'u', password: 'p', extra: {} }).extra, null);
});

test('the bookmarklet is valid JavaScript, holds the key and no credentials', () => {
  const key = newAutofillKey();
  const src = bookmarkletSource(key);
  assert.doesNotThrow(() => new vm.Script(src));
  assert.ok(src.includes(key));
  assert.ok(!src.includes('S3cret'));
  assert.ok(src.length < 40_000, `bookmarklet is ${src.length} characters`);
});

test('the bookmarklet URL survives the percent-decoding a browser applies to javascript: URLs', () => {
  const key = newAutofillKey();
  const url = bookmarkletUrl(key);
  assert.ok(url.startsWith('javascript:void('));
  assert.ok(!/[\s"<>]/.test(url));
  const decoded = decodeURIComponent(url.slice('javascript:void('.length, -1));
  assert.equal(decoded, bookmarkletSource(key));
});

test('the stringified engine inside the bookmarklet matches the real one in behaviour-critical details', () => {
  const src = bookmarkletSource(newAutofillKey());
  for (const needle of ['__MYNONREV__', 'isLoginContext', 'findByText', 'comboPick', 'GRACE_AUTHED']) assert.ok(src.includes(needle), needle);
});
