// The lock screen: first run creates the vault, afterwards it unlocks it.
import { h } from '../dom.js';
import * as vault from '../vault.js';
import { confirmSheet, passwordField, toast } from '../ui.js';
import { restoreFlow } from '../backup.js';

const logo = () => h('img', { class: 'lock-logo', src: 'icons/icon.svg', alt: '', width: 84, height: 84 });

function setupView() {
  const pass = passwordField({ label: 'Passphrase', autocomplete: 'new-password', name: 'new-passphrase', hint: 'At least 8 characters. A few random words make a strong one.' });
  const again = passwordField({ label: 'Repeat passphrase', autocomplete: 'new-password', name: 'new-passphrase-confirm' });
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const submit = h('button', { type: 'submit', class: 'btn primary block' }, 'Create vault');

  const form = h('form', { class: 'stack', novalidate: true },
    pass.el, again.el, error, submit);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = true;
    const fail = (msg) => { error.textContent = msg; error.hidden = false; };
    try { vault.checkPassphrase(pass.input.value); } catch (err) { fail(err.message); pass.input.focus(); return; }
    if (pass.input.value !== again.input.value) { fail('The two passphrases do not match.'); again.input.focus(); return; }
    submit.disabled = true;
    submit.textContent = 'Creating…';
    try {
      await vault.create(pass.input.value);
      // Ask the browser not to evict the vault under storage pressure. Best effort: not every browser grants it.
      navigator.storage?.persist?.().catch(() => {});
    } catch (err) {
      fail(err.message || 'Could not create the vault.');
      submit.disabled = false;
      submit.textContent = 'Create vault';
    }
  });

  return {
    bare: true, noFocus: true, title: 'myNonRev',
    el: h('div', { class: 'page lock' },
      logo(),
      h('h1', null, 'Create your vault'),
      h('p', { class: 'muted center' }, 'Your airline logins are encrypted with a passphrase and stay on this device. Nothing is sent anywhere.'),
      form,
      h('p', { class: 'notice warn' }, 'There is no way to recover a forgotten passphrase. If you lose it, the saved logins are gone for good.'),
      h('button', { type: 'button', class: 'link-btn', onclick: () => restoreFlow({ replacing: false }) }, 'Restore from a backup instead')),
    onMount: () => pass.input.focus(),
  };
}

function unlockView() {
  const pass = passwordField({ label: 'Passphrase', autocomplete: 'current-password', name: 'passphrase' });
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const submit = h('button', { type: 'submit', class: 'btn primary block' }, 'Unlock');

  const form = h('form', { class: 'stack', novalidate: true }, pass.el, error, submit);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!pass.input.value) return;
    error.hidden = true;
    submit.disabled = true;
    submit.textContent = 'Unlocking…';
    try {
      await vault.unlock(pass.input.value);
    } catch (err) {
      error.textContent = err.message || 'Could not unlock.';
      error.hidden = false;
      submit.disabled = false;
      submit.textContent = 'Unlock';
      pass.input.select();
    }
  });

  async function forgot() {
    const ok = await confirmSheet({
      title: 'Erase everything?',
      message: 'A forgotten passphrase cannot be recovered. This erases the vault on this device so you can start over. If you have a backup, you can restore it afterwards.',
      confirmLabel: 'Erase vault', danger: true,
    });
    if (!ok) return;
    vault.erase();
    toast('Vault erased.');
  }

  return {
    bare: true, noFocus: true, title: 'myNonRev',
    el: h('div', { class: 'page lock' },
      logo(),
      h('h1', null, 'myNonRev'),
      h('p', { class: 'muted center' }, 'Locked'),
      form,
      h('button', { type: 'button', class: 'link-btn', onclick: forgot }, 'Forgot passphrase?')),
    onMount: () => pass.input.focus(),
  };
}

export const lockView = () => (vault.exists() ? unlockView() : setupView());
