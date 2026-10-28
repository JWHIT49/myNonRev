import { applyAppearance } from './appearance.js';
import * as router from './router.js';
import { mount } from './shell.js';
import { registerServiceWorker } from './pwa.js';
import * as vault from './vault.js';
import { startAutoLock } from './autolock.js';
import { closeAllSheets, toast } from './ui.js';
import { lockView } from './views/lock.js';
import { homeView } from './views/home.js';
import { portalView } from './views/portal.js';
import { editView } from './views/edit.js';
import { autofillView } from './views/autofill.js';
import { settingsView } from './views/settings.js';

applyAppearance();

router.on('/', homeView);
router.on('/p/:id', portalView);
router.on('/p/:id/edit', editView);
router.on('/add', editView);
router.on('/autofill', autofillView);
router.on('/settings', settingsView);

// Locked: every address shows the lock screen. Nothing else is rendered (and nothing decrypted is in memory).
router.setGuard(() => (vault.isUnlocked() ? null : lockView()));

// Locking, unlocking, erasing or restoring all change what the page should show.
vault.onLockChange((unlocked) => {
  if (!unlocked) closeAllSheets();
  router.refresh();
});

startAutoLock();
router.start(mount);
registerServiceWorker();

addEventListener('unhandledrejection', (e) => {
  if (e.reason?.name === 'VaultError') { e.preventDefault(); toast(e.reason.message); }
});
