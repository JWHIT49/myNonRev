// Encrypted backups: export the vault envelope as a file, restore one onto this device.
import { h } from './dom.js';
import * as vault from './vault.js';
import { openSheet, passwordField, toast } from './ui.js';
import { isNative, plugin } from './native.js';
import * as biometric from './biometric.js';

export async function exportBackup() {
  const text = vault.exportBackup();
  const name = `myNonRev-backup-${new Date().toISOString().slice(0, 10)}.json`;
  if (isNative()) {
    // A native web view cannot download blobs: write the file and hand it to the iOS share sheet (Save to Files, iCloud Drive, ...).
    try {
      const { uri } = await plugin('Filesystem').writeFile({ path: name, data: text, directory: 'CACHE', encoding: 'utf8' });
      await plugin('Share').share({ title: 'myNonRev backup', files: [uri] });
    } catch (err) {
      if (!/cancel/i.test(String(err?.message ?? err))) toast('Could not export the backup.');
    }
    return;
  }
  const file = new File([text], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'myNonRev backup' });
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  toast('Backup saved. It is encrypted: you need your passphrase to restore it.');
}

/** Lets the user pick a backup file, then asks for its passphrase. `replacing` adds a warning that this device's vault will be replaced. */
export function restoreFlow({ replacing }) {
  for (const stale of document.querySelectorAll('input[data-restore]')) stale.remove(); // a cancelled picker never fires "change"
  const input = h('input', { type: 'file', accept: 'application/json,.json', class: 'sr', tabindex: '-1', dataset: { restore: '1' } });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) return;
    let text;
    try {
      text = await file.text();
      vault.parseEnvelope(text);
    } catch (err) {
      toast(err.message || 'That file could not be read.');
      return;
    }
    askPassphrase(text, replacing);
  });
  document.body.append(input);
  input.click();
}

function askPassphrase(text, replacing) {
  const pass = passwordField({ label: 'Passphrase of this backup', autocomplete: 'current-password' });
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const restore = h('button', { type: 'button', class: 'btn primary' }, 'Restore');
  const sheet = openSheet({
    title: 'Restore backup',
    content: h('div', { class: 'stack-sm' },
      h('p', { class: 'sheet-text' }, replacing
        ? 'This replaces every login on this device with the ones in the backup. Your current passphrase will be replaced by the backup’s.'
        : 'Enter the passphrase you used when you made this backup.'),
      pass.el, error),
    actions: [h('button', { type: 'button', class: 'btn ghost', onclick: () => sheet.close() }, 'Cancel'), restore],
  });
  restore.addEventListener('click', async () => {
    restore.disabled = true;
    restore.textContent = 'Restoring…';
    error.hidden = true;
    try {
      await vault.importBackup(text, pass.input.value);
      await biometric.refresh(pass.input.value);
      sheet.close();
      toast('Backup restored.');
    } catch (err) {
      error.textContent = err.message || 'Could not restore that backup.';
      error.hidden = false;
      restore.disabled = false;
      restore.textContent = 'Restore';
    }
  });
}
