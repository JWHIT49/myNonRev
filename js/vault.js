// The encrypted vault: every saved login lives inside one AES-GCM envelope in localStorage. The decrypted contents exist only in memory,
// only while unlocked. Locking drops the key and the data.
//
// Envelope (what is stored, and what a backup file contains):
//   { v: 1, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt }, wrap: { iv, ct }, data: { iv, ct } }
//
// Plain contents (after decrypting):
//   { v: 1, creds: { [portalId]: { username, password, extra: { [key]: value } } }, portals: [custom portal], autofillKey: string | null }
import {
  PBKDF2_ITERATIONS, MIN_ITERATIONS, MAX_ITERATIONS, b64, unb64, randomBytes,
  deriveKek, newDataKey, wrapDataKey, unwrapDataKey, encryptJson, decryptJson,
} from './crypto.js';

export const STORAGE_KEY = 'mynonrev.vault.v1';
const AAD = 'mynonrev.vault.v1';

export class VaultError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'VaultError';
    this.code = code; // 'locked' | 'bad-passphrase' | 'exists' | 'bad-backup' | 'weak-passphrase' | 'storage'
  }
}

let storage = () => globalThis.localStorage;
/** Tests inject an in-memory store; the app uses localStorage. */
export const useStorage = (provider) => { storage = provider; };

let session = null; // { dek: CryptoKey, data: object }
let queue = Promise.resolve();
const listeners = new Set();
const notify = () => listeners.forEach((fn) => { try { fn(isUnlocked()); } catch (err) { console.error(err); } });
export const onLockChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export const emptyData = () => ({ v: 1, creds: {}, portals: [], autofillKey: null });

const readRaw = () => { try { return storage().getItem(STORAGE_KEY); } catch { return null; } };
export const exists = () => readRaw() !== null;
export const isUnlocked = () => session !== null;

function writeRaw(text) {
  try { storage().setItem(STORAGE_KEY, text); } catch (err) { throw new VaultError('storage', `Your device would not save the vault (${err.message || 'storage is full or blocked'}).`); }
}

const isB64 = (s, min = 1) => typeof s === 'string' && s.length >= min && /^[A-Za-z0-9+/]+={0,2}$/.test(s);
const isBox = (b) => b && typeof b === 'object' && isB64(b.iv, 16) && isB64(b.ct, 24);

/** Parses and validates a stored envelope or backup file. Throws VaultError('bad-backup'). */
export function parseEnvelope(text) {
  let env;
  try { env = JSON.parse(text); } catch { throw new VaultError('bad-backup', 'That file is not a myNonRev backup.'); }
  const ok = env && env.v === 1 && env.kdf && env.kdf.name === 'PBKDF2' && env.kdf.hash === 'SHA-256'
    && Number.isInteger(env.kdf.iterations) && env.kdf.iterations >= MIN_ITERATIONS && env.kdf.iterations <= MAX_ITERATIONS
    && isB64(env.kdf.salt, 16) && isBox(env.wrap) && isBox(env.data);
  if (!ok) throw new VaultError('bad-backup', 'That file is not a valid myNonRev backup.');
  return env;
}

function normalize(data) {
  const base = emptyData();
  if (!data || typeof data !== 'object') return base;
  return {
    v: 1,
    creds: data.creds && typeof data.creds === 'object' ? data.creds : base.creds,
    portals: Array.isArray(data.portals) ? data.portals : base.portals,
    autofillKey: typeof data.autofillKey === 'string' ? data.autofillKey : null,
  };
}

async function open(env, passphrase, extractable = false) {
  const kek = await deriveKek(passphrase, unb64(env.kdf.salt), env.kdf.iterations);
  let dek;
  try { dek = await unwrapDataKey(env.wrap, kek, { extractable }); } catch { throw new VaultError('bad-passphrase', 'That passphrase is not correct.'); }
  let data;
  try { data = normalize(await decryptJson(dek, env.data, AAD)); } catch { throw new VaultError('bad-backup', 'The vault data could not be read.'); }
  return { dek, data };
}

const seal = async (dek, data) => ({ data: await encryptJson(dek, data, AAD) });

export function checkPassphrase(passphrase) {
  if (typeof passphrase !== 'string' || passphrase.length < 8) throw new VaultError('weak-passphrase', 'Use at least 8 characters.');
}

export async function create(passphrase, { iterations = PBKDF2_ITERATIONS } = {}) {
  if (exists()) throw new VaultError('exists', 'A vault already exists on this device.');
  checkPassphrase(passphrase);
  const salt = randomBytes(16);
  const kek = await deriveKek(passphrase, salt, iterations);
  const dek = await newDataKey();
  const env = {
    v: 1,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: b64(salt) },
    wrap: await wrapDataKey(dek, kek),
    ...(await seal(dek, emptyData())),
  };
  writeRaw(JSON.stringify(env));
  await unlock(passphrase);
}

export async function unlock(passphrase) {
  const raw = readRaw();
  if (raw === null) throw new VaultError('locked', 'There is no vault on this device yet.');
  session = await open(parseEnvelope(raw), passphrase);
  notify();
}

export function lock() {
  if (!session) return;
  session = null;
  notify();
}

/** A copy of the decrypted contents (so a view can never change them without save()). */
export function snapshot() {
  if (!session) throw new VaultError('locked', 'The vault is locked.');
  return structuredClone(session.data);
}

/** Applies mutator to a copy of the contents, encrypts and stores the result, and only then adopts it. Writes are serialized. */
export function save(mutator) {
  const run = async () => {
    if (!session) throw new VaultError('locked', 'The vault is locked.');
    const { dek } = session;
    const next = structuredClone(session.data);
    await mutator(next);
    const env = parseEnvelope(readRaw());
    writeRaw(JSON.stringify({ ...env, ...(await seal(dek, normalize(next))) }));
    if (session && session.dek === dek) session.data = normalize(next);
    return structuredClone(session?.data ?? next);
  };
  const result = queue.then(run, run);
  queue = result.catch(() => {});
  return result;
}

export async function changePassphrase(oldPassphrase, newPassphrase, { iterations = PBKDF2_ITERATIONS } = {}) {
  checkPassphrase(newPassphrase);
  const env = parseEnvelope(readRaw());
  const { dek } = await open(env, oldPassphrase, true);
  const salt = randomBytes(16);
  const kek = await deriveKek(newPassphrase, salt, iterations);
  const next = { ...env, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: b64(salt) }, wrap: await wrapDataKey(dek, kek) };
  writeRaw(JSON.stringify(next));
  // Re-open so the in-memory key is the non-extractable copy again.
  session = await open(next, newPassphrase);
}

/** The encrypted envelope as text: safe to store anywhere, useless without the passphrase. */
export function exportBackup() {
  const raw = readRaw();
  if (raw === null) throw new VaultError('bad-backup', 'There is nothing to back up yet.');
  return `${JSON.stringify(parseEnvelope(raw), null, 2)}\n`;
}

/** Replaces this device's vault with a backup. The backup's passphrase becomes the passphrase. */
export async function importBackup(text, passphrase) {
  const env = parseEnvelope(text);
  const opened = await open(env, passphrase);
  writeRaw(JSON.stringify(env));
  session = opened;
  notify();
}

export function erase() {
  session = null;
  try { storage().removeItem(STORAGE_KEY); } catch { /* nothing to remove */ }
  notify();
}
