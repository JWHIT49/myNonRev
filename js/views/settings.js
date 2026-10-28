import { h, icon } from '../dom.js';
import * as vault from '../vault.js';
import * as store from '../store.js';
import { applyAppearance } from '../appearance.js';
import { restartAutoLock } from '../autolock.js';
import { checkForUpdates, clearOfflineCache, getBuildInfo, isStandalone, offlineReady } from '../pwa.js';
import { confirmSheet, openSheet, passwordField, row, segmented, toast } from '../ui.js';
import { exportBackup, restoreFlow } from '../backup.js';

function changePassphraseSheet() {
  const current = passwordField({ label: 'Current passphrase', autocomplete: 'current-password' });
  const next = passwordField({ label: 'New passphrase', autocomplete: 'new-password', hint: 'At least 8 characters.' });
  const again = passwordField({ label: 'Repeat new passphrase', autocomplete: 'new-password' });
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const save = h('button', { type: 'button', class: 'btn primary' }, 'Change passphrase');
  const sheet = openSheet({
    title: 'Change passphrase',
    content: h('div', { class: 'stack-sm' }, current.el, next.el, again.el, error),
    actions: [h('button', { type: 'button', class: 'btn ghost', onclick: () => sheet.close() }, 'Cancel'), save],
  });
  save.addEventListener('click', async () => {
    error.hidden = true;
    const fail = (msg) => { error.textContent = msg; error.hidden = false; };
    if (next.input.value !== again.input.value) return fail('The new passphrases do not match.');
    save.disabled = true;
    save.textContent = 'Changing…';
    try {
      await vault.changePassphrase(current.input.value, next.input.value);
      sheet.close();
      toast('Passphrase changed. Old backups still need the passphrase they were made with.', { duration: 6000 });
    } catch (err) {
      fail(err.message || 'Could not change the passphrase.');
      save.disabled = false;
      save.textContent = 'Change passphrase';
    }
  });
}

async function eraseEverything() {
  const ok = await confirmSheet({
    title: 'Erase all data?',
    message: 'This deletes the vault, every saved login and your autofill key from this device. It cannot be undone unless you have a backup.',
    confirmLabel: 'Erase everything', danger: true,
  });
  if (!ok) return;
  vault.erase();
  toast('All data erased.');
}

export function settingsView() {
  const status = h('span', { class: 'row-sub' }, 'Checking…');
  getBuildInfo().then((info) => {
    status.textContent = `${offlineReady() ? 'Ready to use offline' : 'Not cached for offline use yet'}${info ? ` · build ${info.id}` : ''}${isStandalone() ? ' · installed' : ''}`;
  });

  const update = h('button', { type: 'button', class: 'row', onclick: async () => {
    const result = await checkForUpdates();
    toast({
      'update-ready': 'A new version is ready.', downloading: 'Downloading the new version…', failed: 'The update could not be downloaded. Try again later.',
      'up-to-date': 'You have the latest version.', unsupported: 'Updates need the installed app or an https address.', offline: 'You appear to be offline.',
    }[result]);
  } }, h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, 'Check for updates'), status), icon('refresh', 18, 'row-chevron'));

  return {
    title: 'Settings', tab: 'settings',
    el: h('div', { class: 'page' },
      h('h2', { class: 'section-title' }, 'Security'),
      h('div', { class: 'card stack-sm' },
        h('div', { class: 'setting' }, h('div', { class: 'setting-title' }, 'Auto-lock'), h('div', { class: 'muted small' }, 'Lock the vault after the app has been left or idle for:'),
          segmented({ options: store.AUTO_LOCK_CHOICES, value: Number(store.get('autoLockMin')), label: 'Auto-lock',
            onChange: (v) => { store.set('autoLockMin', v); restartAutoLock(); } })),
        h('div', { class: 'btn-row wrap' },
          h('button', { type: 'button', class: 'btn grow', onclick: () => vault.lock() }, icon('lock', 18), 'Lock now'),
          h('button', { type: 'button', class: 'btn grow', onclick: changePassphraseSheet }, icon('key', 18), 'Change passphrase'))),

      h('h2', { class: 'section-title' }, 'Backup'),
      h('div', { class: 'card stack-sm' },
        h('p', { class: 'muted small' }, 'Your logins live only on this device. A backup is an encrypted file you can keep in Files or iCloud Drive; it needs your passphrase to open.'),
        h('div', { class: 'btn-row wrap' },
          h('button', { type: 'button', class: 'btn grow', onclick: exportBackup }, icon('download', 18), 'Export backup'),
          h('button', { type: 'button', class: 'btn grow', onclick: () => restoreFlow({ replacing: true }) }, icon('upload', 18), 'Restore backup'))),

      h('h2', { class: 'section-title' }, 'Appearance'),
      h('div', { class: 'card' },
        segmented({ options: [{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }], value: store.get('theme'), label: 'Theme',
          onChange: (v) => { store.set('theme', v); applyAppearance(); } })),

      h('h2', { class: 'section-title' }, 'App'),
      h('div', { class: 'card list' },
        update,
        row({ title: 'Clear offline copy', sub: 'Re-downloads the app. Your saved logins are not touched.', chevron: false, onClick: async () => {
          const ok = await confirmSheet({ title: 'Clear offline copy?', message: 'The app re-downloads itself the next time you open it with a connection. Your vault is not affected.', confirmLabel: 'Clear' });
          if (ok) clearOfflineCache();
        } })),

      h('div', { class: 'card danger-zone' },
        h('button', { type: 'button', class: 'btn danger-outline block', onclick: eraseEverything }, icon('trash', 18), 'Erase all data')),

      h('p', { class: 'muted small footnote center' }, 'myNonRev keeps everything on this device. Use it only for your own accounts and authorized employee travel.')),
  };
}
