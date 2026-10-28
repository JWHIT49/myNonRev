import { h, icon } from '../dom.js';
import * as vault from '../vault.js';
import * as store from '../store.js';
import { allPortals } from '../portals.js';
import { badge, installHint } from '../ui.js';
import { autofillReady, openPortal } from '../launch.js';

function portalCard(portal, data) {
  const saved = Boolean(data.creds[portal.id]?.username);
  const sign = autofillReady(data, portal.id);
  return h('div', { class: 'card portal' },
    h('a', { class: 'portal-main', href: `#/p/${portal.id}` },
      badge(portal),
      h('span', { class: 'portal-text' },
        h('span', { class: 'portal-name' }, portal.name),
        h('span', { class: 'portal-sub' }, portal.subtitle),
        h('span', { class: 'status' }, h('i', { class: ['dot', saved && 'on'] }), saved ? 'Login saved' : 'No login saved'))),
    h('button', {
      type: 'button', class: ['btn small', sign ? 'primary' : 'ghost'], 'aria-label': `${sign ? 'Open and sign in to' : 'Open'} ${portal.name}`,
      onclick: () => openPortal(portal),
    }, icon(sign ? 'bolt' : 'external', 16), sign ? 'Sign in' : 'Open'));
}

export function homeView() {
  const data = vault.snapshot();
  const portals = allPortals(data);
  const anySaved = portals.some((p) => data.creds[p.id]?.username);
  const hint = installHint({ dismissed: store.get('installHintDismissed'), onDismiss: () => store.set('installHintDismissed', true) });
  return {
    title: 'myNonRev', tab: 'home',
    actions: [{ icon: 'plus', label: 'Add a portal', href: '#/add' }],
    el: h('div', { class: 'page' },
      hint,
      h('div', { class: 'page-head' }, h('h1', null, 'Your travel portals'), h('p', { class: 'muted' }, 'Tap a portal for its saved login, or Open to go straight to the site.')),
      !anySaved ? h('div', { class: 'notice' }, icon('key', 22), h('div', { class: 'notice-text' }, h('b', null, 'Save your first login'), h('span', null, 'Open a portal below and tap “Add login”. Everything is encrypted with your passphrase.'))) : null,
      h('div', { class: 'stack-sm' }, ...portals.map((p) => portalCard(p, data))),
      h('p', { class: 'muted small footnote' }, 'Logins are encrypted on this device and are never sent anywhere by this app.')),
  };
}
