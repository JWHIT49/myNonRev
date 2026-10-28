import test from 'node:test';
import assert from 'node:assert/strict';
import * as vault from '../js/vault.js';
import * as biometric from '../js/biometric.js';

// One stub for the NativeBiometric plugin (native.js memoizes plugins), with a fake Keychain behind it.
let keychain = new Map();
let next = null; // optional error to throw from getSecureCredentials
const calls = [];
const stub = {
  isAvailable: async () => ({ isAvailable: true, biometryType: 2 }),
  setCredentials: async (o) => { calls.push(['set', o]); keychain.set(o.server, o); },
  deleteCredentials: async (o) => { calls.push(['delete', o.server]); keychain.delete(o.server); },
  getSecureCredentials: async (o) => {
    if (next) { const e = next; next = null; throw e; }
    const item = keychain.get(o.server);
    if (!item) throw Object.assign(new Error('none'), { code: '21' });
    return { username: item.username, password: item.password };
  },
};
globalThis.Capacitor = { isNativePlatform: () => true, registerPlugin: (n) => { assert.equal(n, 'NativeBiometric'); return stub; } };

const FAST = { iterations: 10_000 };
async function freshVault(pass = 'correct horse battery') {
  const mem = new Map();
  vault.useStorage(() => ({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) }));
  vault.erase();
  keychain = new Map();
  next = null;
  calls.length = 0;
  await biometric.disable();
  calls.length = 0;
  await vault.create(pass, FAST);
  vault.lock();
}

test('enabling checks the passphrase first and stores it behind biometrics', async () => {
  await freshVault();
  await assert.rejects(biometric.enable('wrong passphrase'), { code: 'bad-passphrase' });
  assert.equal(biometric.isEnabled(), false);
  assert.equal(keychain.size, 0);

  await biometric.enable('correct horse battery');
  assert.equal(biometric.isEnabled(), true);
  assert.equal(biometric.label(), 'Face ID');
  const stored = [...keychain.values()][0];
  assert.equal(stored.password, 'correct horse battery');
  assert.equal(stored.accessControl, 1, 'must use the biometric-only (current set) access control');
});

test('Face ID unlocks the vault', async () => {
  await freshVault();
  await biometric.enable('correct horse battery');
  assert.equal(await biometric.unlockWithBiometrics(), 'ok');
  assert.equal(vault.isUnlocked(), true);
});

test('cancelling or a failed scan leaves the vault locked and Face ID on', async () => {
  await freshVault();
  await biometric.enable('correct horse battery');
  for (const code of ['16', '15', '10', '17']) {
    next = Object.assign(new Error('cancel'), { code });
    assert.equal(await biometric.unlockWithBiometrics(), 'cancelled', code);
  }
  assert.equal(vault.isUnlocked(), false);
  assert.equal(biometric.isEnabled(), true);
});

test('an unknown plugin error is reported as failed and keeps Face ID on', async () => {
  await freshVault();
  await biometric.enable('correct horse battery');
  next = Object.assign(new Error('boom'), { code: '99' });
  assert.equal(await biometric.unlockWithBiometrics(), 'failed');
  assert.equal(biometric.isEnabled(), true);
});

test('if the Keychain item is gone (for example after the enrolled faces changed), Face ID turns itself off', async () => {
  await freshVault();
  await biometric.enable('correct horse battery');
  keychain.clear();
  assert.equal(await biometric.unlockWithBiometrics(), 'stale');
  assert.equal(biometric.isEnabled(), false);
  assert.equal(vault.isUnlocked(), false);
});

test('a stored passphrase that no longer matches turns Face ID off instead of looping', async () => {
  await freshVault();
  await biometric.enable('correct horse battery');
  await vault.unlock('correct horse battery');
  await vault.changePassphrase('correct horse battery', 'a brand new passphrase', FAST); // Keychain copy is now out of date
  vault.lock();
  assert.equal(await biometric.unlockWithBiometrics(), 'stale');
  assert.equal(biometric.isEnabled(), false);
  assert.ok(calls.some((c) => c[0] === 'delete'));
});

test('refresh keeps Face ID working after the passphrase changes, and is a no-op when Face ID is off', async () => {
  await freshVault();
  await biometric.refresh('anything at all');
  assert.equal(calls.filter((c) => c[0] === 'set').length, 0);

  await biometric.enable('correct horse battery');
  await vault.unlock('correct horse battery');
  await vault.changePassphrase('correct horse battery', 'a brand new passphrase', FAST);
  await biometric.refresh('a brand new passphrase');
  vault.lock();
  assert.equal(await biometric.unlockWithBiometrics(), 'ok');
  assert.equal(vault.isUnlocked(), true);
});

test('disabling removes the Keychain item', async () => {
  await freshVault();
  await biometric.enable('correct horse battery');
  await biometric.disable();
  assert.equal(biometric.isEnabled(), false);
  assert.equal(keychain.size, 0);
});

test('verifyPassphrase checks a passphrase without unlocking', async () => {
  await freshVault();
  await vault.verifyPassphrase('correct horse battery');
  assert.equal(vault.isUnlocked(), false);
  await assert.rejects(vault.verifyPassphrase('nope nope nope'), { code: 'bad-passphrase' });
});
