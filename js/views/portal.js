// One portal: open it, and copy or reveal its saved login.
import { h, icon } from '../dom.js';
import * as vault from '../vault.js';
import { getPortal } from '../portals.js';
import { badge, confirmSheet, toast } from '../ui.js';
import { copySecret, copyText } from '../clip.js';
import { autofillReady, openPortal } from '../launch.js';
import * as router from '../router.js';

const REVEAL_MS = 15_000;

function credRow({ label, value, secret = false }) {
  let shown = false;
  let timer = null;
  const valueEl = h('span', { class: 'cred-value' }, secret ? '••••••••••' : value);
  const toggle = secret ? h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Show ${label.toLowerCase()}` }, icon('eye', 20)) : null;
  const hide = () => {
    clearTimeout(timer);
    shown = false;
    valueEl.textContent = '••••••••••';
    toggle?.replaceChildren(icon('eye', 20));
    toggle?.setAttribute('aria-label', `Show ${label.toLowerCase()}`);
  };
  toggle?.addEventListener('click', () => {
    if (shown) { hide(); return; }
    shown = true;
    valueEl.textContent = value;
    toggle.replaceChildren(icon('eye-off', 20));
    toggle.setAttribute('aria-label', `Hide ${label.toLowerCase()}`);
    timer = setTimeout(hide, REVEAL_MS);
  });
  const copy = h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Copy ${label.toLowerCase()}` }, icon('copy', 20));
  copy.addEventListener('click', async () => {
    const ok = await (secret ? copySecret(value) : copyText(value));
    toast(ok ? `${label} copied${secret ? ' (cleared from the clipboard in 30 s)' : ''}.` : 'Could not copy. Use the eye button to read it instead.');
  });
  return h('div', { class: 'cred' },
    h('div', { class: 'cred-main' }, h('span', { class: 'cred-label' }, label), valueEl),
    toggle, copy);
}

export function portalView({ params }) {
  const data = vault.snapshot();
  const portal = getPortal(data, params.id);
  if (!portal) return { notFound: true };
  const creds = data.creds[portal.id];
  const saved = Boolean(creds?.username);
  const sign = autofillReady(data, portal.id);
  const host = new URL(portal.url).hostname;

  async function removeLogin() {
    const ok = await confirmSheet({ title: 'Delete this login?', message: `Remove the saved ${portal.name} login from this device? The airline account itself is not affected.`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    await vault.save((d) => { delete d.creds[portal.id]; });
    toast('Login deleted.');
    router.refresh();
  }

  return {
    title: portal.name, back: '#/', tab: 'home',
    actions: [{ icon: 'edit', label: saved ? 'Edit login' : 'Add login', href: `#/p/${portal.id}/edit` }],
    el: h('div', { class: 'page' },
      h('div', { class: 'card hero' }, badge(portal, 'lg'), h('div', { class: 'hero-text' }, h('h1', null, portal.name), h('p', { class: 'muted' }, portal.subtitle), h('p', { class: 'muted small host' }, host))),
      h('div', { class: 'btn-row wrap' },
        h('button', { type: 'button', class: 'btn primary grow', onclick: () => openPortal(portal) }, icon(sign ? 'bolt' : 'external', 18), sign ? 'Open & sign in' : 'Open site'),
        sign ? h('button', { type: 'button', class: 'btn grow', onclick: () => openPortal(portal, { autofill: false }) }, icon('external', 18), 'Open site only') : null),
      saved && !data.autofillKey ? h('a', { class: 'notice link', href: '#/autofill' }, icon('bolt', 22), h('div', { class: 'notice-text' }, h('b', null, 'Sign in automatically'), h('span', null, 'Set up autofill once and this button signs you in on the airline’s page.')), icon('chevron-right', 18)) : null,
      saved
        ? h('div', { class: 'card' },
          h('h3', null, icon('key', 18), 'Saved login'),
          credRow({ label: 'Username', value: creds.username }),
          credRow({ label: 'Password', value: creds.password, secret: true }),
          portal.extraField && creds.extra?.[portal.extraField.key] ? credRow({ label: portal.extraField.label, value: creds.extra[portal.extraField.key] }) : null)
        : h('div', { class: 'card empty-card' },
          h('h3', null, 'No login saved'),
          h('p', { class: 'muted' }, 'Save your username and password to copy them in one tap or sign in automatically.'),
          h('a', { class: 'btn primary block', href: `#/p/${portal.id}/edit` }, icon('plus', 18), 'Add login')),
      saved ? h('div', { class: 'btn-row wrap' },
        h('a', { class: 'btn grow', href: `#/p/${portal.id}/edit` }, icon('edit', 18), 'Edit'),
        h('button', { type: 'button', class: 'btn grow danger-outline', onclick: removeLogin }, icon('trash', 18), 'Delete login')) : null),
  };
}
