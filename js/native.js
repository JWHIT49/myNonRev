// The bridge to the native (Capacitor) shell. In a normal browser every function here does nothing, so the PWA is unchanged.
// There is no bundler, so plugins are reached through the Capacitor runtime that the native shell injects into the page.
import * as vault from './vault.js';

export const isNative = () => Boolean(globalThis.Capacitor?.isNativePlatform?.());

const registered = {};
/** A native plugin by name. Only call when isNative(). */
export const plugin = (name) => (registered[name] ??= globalThis.Capacitor.registerPlugin(name));

/**
 * Keeps a second copy of the encrypted vault in native storage (UserDefaults). iOS can purge a web view's localStorage when the device is
 * short on space, but not this. Preferences is the durable copy: if localStorage is empty on launch the vault is restored from it.
 * Only ciphertext is ever stored.
 */
async function mirrorVault() {
  const prefs = plugin('Preferences');
  const key = vault.STORAGE_KEY;
  const { value } = await prefs.get({ key });
  if (value) localStorage.setItem(key, value);
  else {
    const local = localStorage.getItem(key);
    if (local) await prefs.set({ key, value: local });
  }
  vault.onPersist((text) => (text === null ? prefs.remove({ key }) : prefs.set({ key, value: text })));
}

export async function initNative() {
  if (!isNative()) return;
  try { await mirrorVault(); } catch (err) { console.warn('Native storage is unavailable', err); }
}
