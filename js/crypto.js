// WebCrypto helpers for the vault. Nothing here touches storage or the DOM, so it runs unchanged under Node's test runner.
//
// Design: a random 256-bit data key (DEK) encrypts the vault contents with AES-GCM. The DEK itself is wrapped by a key derived from the
// passphrase (PBKDF2-SHA-256). Changing the passphrase only re-wraps the DEK; the stored data does not have to be re-encrypted.
const enc = new TextEncoder();
const dec = new TextDecoder();

export const PBKDF2_ITERATIONS = 600_000;
export const MIN_ITERATIONS = 10_000;
export const MAX_ITERATIONS = 5_000_000;

const subtle = () => globalThis.crypto.subtle;
export const randomBytes = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));

export function b64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const b64url = (buf) => b64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export function unb64url(s) {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  return unb64(t + '='.repeat((4 - (t.length % 4)) % 4));
}

export async function deriveKek(passphrase, salt, iterations) {
  const base = await subtle().importKey('raw', enc.encode(String(passphrase).normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base, { name: 'AES-GCM', length: 256 }, false, ['wrapKey', 'unwrapKey'],
  );
}

export const newDataKey = () => subtle().generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);

export async function wrapDataKey(dek, kek) {
  const iv = randomBytes(12);
  const ct = await subtle().wrapKey('raw', dek, kek, { name: 'AES-GCM', iv });
  return { iv: b64(iv), ct: b64(ct) };
}

/** Throws (OperationError) when the passphrase is wrong: the GCM tag does not verify. */
export function unwrapDataKey(wrapped, kek, { extractable = false } = {}) {
  return subtle().unwrapKey(
    'raw', unb64(wrapped.ct), kek, { name: 'AES-GCM', iv: unb64(wrapped.iv) },
    { name: 'AES-GCM', length: 256 }, extractable, ['encrypt', 'decrypt'],
  );
}

export async function encryptJson(key, value, aad) {
  const iv = randomBytes(12);
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, key, enc.encode(JSON.stringify(value)));
  return { iv: b64(iv), ct: b64(ct) };
}

export async function decryptJson(key, box, aad) {
  const plain = await subtle().decrypt({ name: 'AES-GCM', iv: unb64(box.iv), additionalData: enc.encode(aad) }, key, unb64(box.ct));
  return JSON.parse(dec.decode(plain));
}
