// Add a custom portal (#/add) or edit a portal's saved login (#/p/:id/edit). Custom portals can also change their name, address and colour.
import { h, icon } from '../dom.js';
import * as vault from '../vault.js';
import { COLORS, getPortal, isBuiltin, newCustomPortal, normalizeUrl, shortCode } from '../portals.js';
import { badge, confirmSheet, field, passwordField, toast } from '../ui.js';
import * as router from '../router.js';

function swatches(initial, onPick) {
  let value = initial;
  const buttons = COLORS.map((c) => h('button', {
    type: 'button', class: ['swatch', c === value && 'on'], style: { '--c': c }, role: 'radio', 'aria-checked': String(c === value), 'aria-label': `Colour ${c}`,
    onclick: () => { value = c; buttons.forEach((b, i) => { b.classList.toggle('on', COLORS[i] === c); b.setAttribute('aria-checked', String(COLORS[i] === c)); }); onPick(c); },
  }));
  return h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Colour' }, ...buttons);
}

export function editView({ params }) {
  const data = vault.snapshot();
  const isNew = !params.id;
  const portal = isNew ? null : getPortal(data, params.id);
  if (!isNew && !portal) return { notFound: true };
  const custom = isNew || Boolean(portal.custom);
  const creds = (portal && data.creds[portal.id]) || { username: '', password: '', extra: {} };
  let color = portal?.color ?? COLORS[0];

  const name = custom ? field({ label: 'Name', value: portal?.name ?? '', placeholder: 'e.g. Alaska Airlines', autocomplete: 'off' }) : null;
  const url = custom ? field({ label: 'Website address', value: portal?.url ?? '', placeholder: 'nonrev.example.com', type: 'url', inputmode: 'url', hint: 'The login page you want to open.' }) : null;
  const user = field({ label: 'Username', value: creds.username, name: 'username', autocomplete: 'off' });
  const pass = passwordField({ label: 'Password', value: creds.password, name: 'password', autocomplete: 'off' });
  const ef = portal?.extraField;
  const extra = ef ? field({ label: ef.label, value: creds.extra?.[ef.key] ?? '', placeholder: ef.placeholder ?? '', autocomplete: 'off', hint: 'Entered on the login page when the site does not already remember it.' }) : null;
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const save = h('button', { type: 'submit', class: 'btn primary block' }, isNew ? 'Add portal' : 'Save');

  const fail = (msg, el) => { error.textContent = msg; error.hidden = false; el?.focus(); };

  const form = h('form', { class: 'stack', novalidate: true },
    custom ? h('div', { class: 'card stack-sm' }, h('h3', null, icon('globe', 18), 'Portal'), name.el, url.el, h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Colour'), swatches(color, (c) => { color = c; }))) : null,
    h('div', { class: 'card stack-sm' }, h('h3', null, icon('key', 18), 'Login'), user.el, pass.el, extra?.el),
    error, save);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = true;
    let portalId = portal?.id;
    let nextPortal = null;
    if (custom) {
      const nm = name.input.value.trim();
      if (!nm) return fail('Enter a name for this portal.', name.input);
      const address = normalizeUrl(url.input.value);
      if (!address) return fail('Enter a valid web address, like nonrev.example.com.', url.input);
      nextPortal = isNew ? newCustomPortal({ name: nm, url: address, color }) : { ...portal, name: nm, short: shortCode(nm), url: address, color, subtitle: new URL(address).hostname };
      delete nextPortal.custom;
      delete nextPortal.navSteps;
      portalId = nextPortal.id;
    }
    const username = user.input.value.trim();
    const wantsLogin = Boolean(username || pass.input.value);
    if (wantsLogin && !username) return fail('Enter the username for this site.', user.input);
    if (!wantsLogin && !custom) return fail('Enter the username for this site. To remove the login, go back and tap Delete login.', user.input);

    save.disabled = true;
    try {
      await vault.save((d) => {
        if (nextPortal) {
          const i = d.portals.findIndex((p) => p.id === nextPortal.id);
          if (i >= 0) d.portals[i] = nextPortal; else d.portals.push(nextPortal);
        }
        if (wantsLogin) {
          d.creds[portalId] = { username, password: pass.input.value, extra: ef ? { [ef.key]: extra.input.value.trim() } : {} };
        }
      });
      toast(isNew ? 'Portal added.' : 'Saved.');
      router.go(`/p/${portalId}`, { replace: true });
    } catch (err) {
      fail(err.message || 'Could not save.');
      save.disabled = false;
    }
  });

  async function removePortal() {
    const ok = await confirmSheet({ title: 'Remove this portal?', message: `Remove ${portal.name} and its saved login from this device?`, confirmLabel: 'Remove', danger: true });
    if (!ok) return;
    await vault.save((d) => { d.portals = d.portals.filter((p) => p.id !== portal.id); delete d.creds[portal.id]; });
    toast('Portal removed.');
    router.go('/', { replace: true });
  }

  return {
    title: isNew ? 'Add a portal' : `${portal.name} login`, back: isNew ? '#/' : `#/p/${portal.id}`, tab: 'home',
    el: h('div', { class: 'page' },
      !isNew ? h('div', { class: 'card hero' }, badge(portal, 'lg'), h('div', { class: 'hero-text' }, h('h1', null, portal.name), h('p', { class: 'muted' }, portal.subtitle))) : null,
      form,
      !isNew && !isBuiltin(portal.id) ? h('button', { type: 'button', class: 'btn danger-outline block', onclick: removePortal }, icon('trash', 18), 'Remove portal') : null),
    onMount: () => (isNew ? name.input : user.input).focus(),
  };
}
