// Unlock with Face ID / Touch ID (native app only).
//
// The vault passphrase is kept in the iOS Keychain with a biometric access control (BIOMETRY_CURRENT_SET): the Keychain itself refuses to
// release it without a successful Face ID / Touch ID scan, and the item is discarded if the enrolled faces or fingerprints change. There is
// no passcode fallback for this item; the passphrase itself is always the fallback. The vault stays encrypted exactly as before.
import { isNative, plugin } from './native.js';
import * as vault from './vault.js';
import * as store from './store.js';

const SERVER = 'com.jwhit49.routeme.vault';
const BIOMETRY_CURRENT_SET = 1; // the plugin's AccessControl enum
const CODE = { USER_CANCEL: '16', SYSTEM_CANCEL: '15', NOT_FOUND: '21' };
const BIOMETRY_LABEL = { 1: 'Touch ID', 2: 'Face ID' };

const bio = () => plugin('NativeBiometric');

export const isEnabled = () => isNative() && store.get('biometric') === true;
export const label = () => store.get('biometricLabel') || 'Face ID';

/** { available, label } for this device. */
export async function check() {
  if (!isNative()) return { available: false, label: 'Face ID' };
  try {
    const r = await bio().isAvailable();
    return { available: Boolean(r?.isAvailable), label: BIOMETRY_LABEL[r?.biometryType] ?? 'biometrics' };
  } catch {
    return { available: false, label: 'Face ID' };
  }
}

/** Turns it on. Needs the current passphrase (checked first, so a typo cannot lock you out later). */
export async function enable(passphrase) {
  await vault.verifyPassphrase(passphrase);
  const { label: name } = await check();
  await bio().setCredentials({ username: 'vault', password: passphrase, server: SERVER, accessControl: BIOMETRY_CURRENT_SET });
  store.set('biometric', true);
  store.set('biometricLabel', name);
}

export async function disable() {
  store.set('biometric', false);
  try { await bio().deleteCredentials({ server: SERVER }); } catch { /* nothing stored */ }
}

/** After the passphrase changes, replace the stored copy (or turn Face ID off if that fails). No-op when it is off. */
export async function refresh(passphrase) {
  if (!isEnabled()) return;
  try {
    await bio().setCredentials({ username: 'vault', password: passphrase, server: SERVER, accessControl: BIOMETRY_CURRENT_SET });
  } catch {
    await disable();
  }
}

/**
 * Tries to unlock the vault with Face ID. Resolves to:
 *   'ok'        unlocked
 *   'cancelled' the user cancelled or the scan did not match: ask for the passphrase
 *   'stale'     the stored passphrase is gone or no longer right (Face ID was turned off): ask for the passphrase
 *   'failed'    anything else
 */
export async function unlockWithBiometrics() {
  let creds;
  try {
    creds = await bio().getSecureCredentials({ server: SERVER, reason: 'Unlock myNonRev' });
  } catch (err) {
    const code = String(err?.code ?? '');
    if (code === CODE.NOT_FOUND) { await disable(); return 'stale'; }
    if (code === CODE.USER_CANCEL || code === CODE.SYSTEM_CANCEL || code === '10' || code === '17') return 'cancelled';
    return 'failed';
  }
  try {
    await vault.unlock(creds.password);
    return 'ok';
  } catch (err) {
    if (err?.code === 'bad-passphrase') { await disable(); return 'stale'; }
    return 'failed';
  }
}
