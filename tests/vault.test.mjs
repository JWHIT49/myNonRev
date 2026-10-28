import test from 'node:test';
import assert from 'node:assert/strict';
import * as vault from '../js/vault.js';
import { STORAGE_KEY } from '../js/vault.js';

const FAST = { iterations: 10_000 };

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k), map };
}

function fresh() {
  const mem = memoryStorage();
  vault.useStorage(() => mem);
  vault.erase();
  return mem;
}

test('create makes an unlocked, empty vault and stores only ciphertext', async () => {
  const mem = fresh();
  assert.equal(vault.exists(), false);
  await vault.create('correct horse battery', FAST);
  assert.equal(vault.exists(), true);
  assert.equal(vault.isUnlocked(), true);
  assert.deepEqual(vault.snapshot().creds, {});
  const stored = mem.getItem(STORAGE_KEY);
  assert.ok(!stored.includes('correct horse'));
});

test('saved logins round-trip through lock and unlock, and are never stored in plaintext', async () => {
  const mem = fresh();
  await vault.create('correct horse battery', FAST);
  await vault.save((d) => { d.creds.delta = { username: 'jdoe', password: 'S3cret-pw!', extra: {} }; });
  assert.ok(!mem.getItem(STORAGE_KEY).includes('S3cret-pw'));
  assert.ok(!mem.getItem(STORAGE_KEY).includes('jdoe'));
  vault.lock();
  assert.equal(vault.isUnlocked(), false);
  assert.throws(() => vault.snapshot(), { code: 'locked' });
  await vault.unlock('correct horse battery');
  assert.equal(vault.snapshot().creds.delta.password, 'S3cret-pw!');
});

test('a wrong passphrase is rejected and leaves the vault locked', async () => {
  fresh();
  await vault.create('correct horse battery', FAST);
  vault.lock();
  await assert.rejects(vault.unlock('wrong passphrase'), { code: 'bad-passphrase' });
  assert.equal(vault.isUnlocked(), false);
});

test('passphrases shorter than 8 characters are refused', async () => {
  fresh();
  await assert.rejects(vault.create('short', FAST), { code: 'weak-passphrase' });
  assert.equal(vault.exists(), false);
});

test('create refuses to overwrite an existing vault', async () => {
  fresh();
  await vault.create('correct horse battery', FAST);
  await assert.rejects(vault.create('another passphrase', FAST), { code: 'exists' });
});

test('snapshot returns a copy: changing it does not change the vault', async () => {
  fresh();
  await vault.create('correct horse battery', FAST);
  const copy = vault.snapshot();
  copy.creds.x = { username: 'u', password: 'p' };
  assert.deepEqual(vault.snapshot().creds, {});
});

test('a failed save leaves the previous contents in place', async () => {
  fresh();
  await vault.create('correct horse battery', FAST);
  await vault.save((d) => { d.creds.a = { username: 'one', password: 'p', extra: {} }; });
  await assert.rejects(vault.save((d) => { d.creds.b = { username: 'two' }; throw new Error('boom'); }), /boom/);
  assert.deepEqual(Object.keys(vault.snapshot().creds), ['a']);
});

test('concurrent saves are applied in order without losing updates', async () => {
  fresh();
  await vault.create('correct horse battery', FAST);
  await Promise.all([1, 2, 3, 4, 5].map((n) => vault.save((d) => { d.creds[`p${n}`] = { username: `u${n}`, password: 'x', extra: {} }; })));
  vault.lock();
  await vault.unlock('correct horse battery');
  assert.equal(Object.keys(vault.snapshot().creds).length, 5);
});

test('changing the passphrase keeps the data and retires the old passphrase', async () => {
  fresh();
  await vault.create('old passphrase 1', FAST);
  await vault.save((d) => { d.creds.delta = { username: 'jdoe', password: 'pw', extra: {} }; });
  await assert.rejects(vault.changePassphrase('not the old one', 'new passphrase 2', FAST), { code: 'bad-passphrase' });
  await vault.changePassphrase('old passphrase 1', 'new passphrase 2', FAST);
  assert.equal(vault.isUnlocked(), true);
  vault.lock();
  await assert.rejects(vault.unlock('old passphrase 1'), { code: 'bad-passphrase' });
  await vault.unlock('new passphrase 2');
  assert.equal(vault.snapshot().creds.delta.username, 'jdoe');
});

test('data saved after a passphrase change is readable with the new passphrase', async () => {
  fresh();
  await vault.create('old passphrase 1', FAST);
  await vault.changePassphrase('old passphrase 1', 'new passphrase 2', FAST);
  await vault.save((d) => { d.autofillKey = 'abc'; });
  vault.lock();
  await vault.unlock('new passphrase 2');
  assert.equal(vault.snapshot().autofillKey, 'abc');
});

test('a backup restores onto an empty device using the backup passphrase', async () => {
  fresh();
  await vault.create('backup passphrase', FAST);
  await vault.save((d) => { d.creds.united = { username: 'ua1', password: 'pw', extra: {} }; d.portals.push({ id: 'c-1', name: 'X', url: 'https://x.example.com/' }); });
  const backup = vault.exportBackup();

  fresh();
  assert.equal(vault.exists(), false);
  await assert.rejects(vault.importBackup(backup, 'nope nope nope'), { code: 'bad-passphrase' });
  assert.equal(vault.exists(), false);
  await vault.importBackup(backup, 'backup passphrase');
  assert.equal(vault.isUnlocked(), true);
  assert.equal(vault.snapshot().creds.united.username, 'ua1');
  assert.equal(vault.snapshot().portals[0].id, 'c-1');
});

test('files that are not backups are rejected without touching the vault', async () => {
  fresh();
  await vault.create('correct horse battery', FAST);
  for (const junk of ['not json', '{}', '{"v":1}', JSON.stringify({ v: 1, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 1, salt: 'AAAAAAAAAAAAAAAAAAAAAA==' }, wrap: {}, data: {} })]) {
    await assert.rejects(vault.importBackup(junk, 'correct horse battery'), { code: 'bad-backup' });
  }
  assert.equal(vault.snapshot().creds && true, true);
});

test('a tampered vault does not unlock', async () => {
  const mem = fresh();
  await vault.create('correct horse battery', FAST);
  vault.lock();
  const env = JSON.parse(mem.getItem(STORAGE_KEY));
  const ct = Buffer.from(env.data.ct, 'base64');
  ct[0] ^= 0xff;
  env.data.ct = ct.toString('base64');
  mem.setItem(STORAGE_KEY, JSON.stringify(env));
  await assert.rejects(vault.unlock('correct horse battery'), { code: 'bad-backup' });
});

test('lock listeners hear about lock and unlock', async () => {
  fresh();
  const seen = [];
  const off = vault.onLockChange((unlocked) => seen.push(unlocked));
  await vault.create('correct horse battery', FAST);
  vault.lock();
  off();
  vault.erase();
  assert.deepEqual(seen, [true, false]);
});

test('erase removes the vault', async () => {
  fresh();
  await vault.create('correct horse battery', FAST);
  vault.erase();
  assert.equal(vault.exists(), false);
  assert.equal(vault.isUnlocked(), false);
});

test('a storage failure surfaces as a VaultError and keeps the old contents', async () => {
  const mem = fresh();
  await vault.create('correct horse battery', FAST);
  const realSet = mem.setItem;
  mem.setItem = () => { throw new Error('QuotaExceededError'); };
  await assert.rejects(vault.save((d) => { d.autofillKey = 'k'; }), { code: 'storage' });
  mem.setItem = realSet;
  assert.equal(vault.snapshot().autofillKey, null);
});
