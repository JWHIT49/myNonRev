// Locks the vault when the app has been left or idle for too long. The wait is measured with the clock, not with timers, because iOS
// freezes timers while the app is in the background.
import * as vault from './vault.js';
import * as store from './store.js';

let hiddenAt = 0;
let idleTimer = null;
let started = false;

const minutes = () => Number(store.get('autoLockMin')) || 0;
// "When I leave" still gets a long idle limit so a forgotten, open app does not stay unlocked forever.
const idleMs = () => (minutes() || 5) * 60_000;

function armIdle() {
  clearTimeout(idleTimer);
  idleTimer = vault.isUnlocked() ? setTimeout(() => vault.lock(), idleMs()) : null;
}

function onHidden() {
  if (!vault.isUnlocked()) return;
  if (minutes() === 0) { vault.lock(); return; }
  hiddenAt = Date.now();
}

function onVisible() {
  if (hiddenAt && vault.isUnlocked() && Date.now() - hiddenAt >= minutes() * 60_000) vault.lock();
  hiddenAt = 0;
  armIdle();
}

export function startAutoLock() {
  if (started) return;
  started = true;
  document.addEventListener('visibilitychange', () => (document.visibilityState === 'hidden' ? onHidden() : onVisible()));
  addEventListener('pagehide', onHidden);
  for (const type of ['pointerdown', 'keydown']) addEventListener(type, () => { if (vault.isUnlocked()) armIdle(); }, { passive: true, capture: true });
  vault.onLockChange(armIdle);
}

/** Call after the setting changes so the new limit applies immediately. */
export const restartAutoLock = armIdle;
