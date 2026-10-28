// Shared UI components: toasts, bottom sheets, confirm dialogs, segmented controls, list rows.
import { h, icon } from './dom.js';
import { isNative } from './native.js';

export function toast(message, { action = null, duration = 3500, sticky = false } = {}) {
  const root = document.getElementById('toast-root');
  let timer = null;
  const dismiss = () => {
    clearTimeout(timer);
    el.classList.remove('show');
    setTimeout(() => el.remove(), 250);
  };
  const el = h('div', { class: 'toast', role: 'status' },
    h('span', { class: 'toast-text' }, message),
    action ? h('button', { type: 'button', class: 'toast-action', onclick: () => { action.onClick(); dismiss(); } }, action.label) : null);
  root.append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  if (!sticky) timer = setTimeout(dismiss, duration);
  return dismiss;
}

const openSheets = new Set();

// While a sheet is open the page behind it must not take focus or be read by assistive tech.
function setBackgroundInert(on) {
  const app = document.getElementById('app');
  if (app) app.inert = on;
}

/** Closes every open sheet (used when the view changes or the vault locks, so a stale dialog cannot act on a page that is gone). */
export function closeAllSheets() {
  for (const ref of [...openSheets]) ref.close();
}

export function openSheet({ title, content, actions = null, onClose = null, className = '' }) {
  const root = document.getElementById('overlay-root');
  const returnFocus = document.activeElement;
  let closed = false;
  const ref = {};
  const close = () => {
    if (closed) return;
    closed = true;
    openSheets.delete(ref);
    if (!openSheets.size) setBackgroundInert(false);
    document.removeEventListener('keydown', onKey);
    backdrop.classList.remove('show');
    sheet.classList.remove('show');
    setTimeout(() => { backdrop.remove(); sheet.remove(); }, 220);
    if (returnFocus && returnFocus.focus && document.contains(returnFocus)) returnFocus.focus({ preventScroll: true });
    onClose?.();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const backdrop = h('div', { class: 'backdrop', onclick: close });
  const sheet = h('div', { class: ['sheet', className], role: 'dialog', 'aria-modal': 'true', 'aria-label': title, tabindex: '-1' },
    h('div', { class: 'sheet-grip', 'aria-hidden': 'true' }),
    h('div', { class: 'sheet-head' },
      h('h2', null, title),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', onclick: close }, icon('x', 22))),
    h('div', { class: 'sheet-body' }, content),
    actions ? h('div', { class: 'sheet-actions' }, ...actions) : null);
  root.append(backdrop, sheet);
  document.addEventListener('keydown', onKey);
  Object.assign(ref, { close, el: sheet });
  openSheets.add(ref);
  setBackgroundInert(true);
  requestAnimationFrame(() => { backdrop.classList.add('show'); sheet.classList.add('show'); sheet.focus({ preventScroll: true }); });
  return ref;
}

export function confirmSheet({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false, extra = null }) {
  return new Promise((resolve) => {
    let decided = false;
    const finish = (value) => {
      if (decided) return;
      decided = true;
      resolve(value);
      ref.close();
    };
    const ref = openSheet({
      title,
      content: [h('p', { class: 'sheet-text' }, message), extra],
      actions: [
        h('button', { type: 'button', class: 'btn ghost', onclick: () => finish(false) }, cancelLabel),
        h('button', { type: 'button', class: ['btn', danger ? 'danger' : 'primary'], onclick: () => finish(true) }, confirmLabel),
      ],
      onClose: () => { if (!decided) { decided = true; resolve(false); } },
    });
  });
}

export function segmented({ options, value, onChange, label = '' }) {
  const wrap = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label });
  const buttons = options.map((o) => h('button', {
    type: 'button', role: 'radio', class: ['seg-btn', o.value === value && 'on'], 'aria-checked': String(o.value === value),
    onclick: () => select(o.value),
  }, o.label));
  function select(v) {
    buttons.forEach((b, i) => {
      const on = options[i].value === v;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    });
    onChange(v);
  }
  wrap.append(...buttons);
  return wrap;
}

export function row({ href, onClick, leading, title, sub, trailing, chevron = true, className = '' }) {
  const tag = href ? 'a' : onClick ? 'button' : 'div';
  const interactive = tag !== 'div';
  return h(tag, { class: ['row', className], href, onclick: onClick, type: tag === 'button' ? 'button' : null },
    leading ? h('span', { class: 'row-lead' }, leading) : null,
    h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, title), sub ? h('span', { class: 'row-sub' }, sub) : null),
    trailing ?? null,
    interactive && chevron ? icon('chevron-right', 18, 'row-chevron') : null);
}

export function emptyState({ iconName = 'info', title, text = '', action = null }) {
  return h('div', { class: 'empty' }, icon(iconName, 36), h('h3', null, title), text ? h('p', { class: 'muted' }, text) : null, action);
}

/** A labelled text field. Returns { el, input }. */
export function field({ label, value = '', type = 'text', placeholder = '', autocomplete = 'off', hint = '', name = null, inputmode = null }) {
  const input = h('input', {
    class: 'input', type, value, placeholder, name, inputmode, autocomplete, autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false',
  });
  input.value = value;
  const el = h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input, hint ? h('span', { class: 'field-hint' }, hint) : null);
  return { el, input };
}

let fieldSeq = 0;

/** A password field with a show/hide toggle. Returns { el, input }. */
export function passwordField({ label, value = '', autocomplete = 'off', hint = '', name = null }) {
  const id = `pw-${++fieldSeq}`;
  const input = h('input', {
    id, class: 'input', type: 'password', placeholder: '', name, autocomplete, autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false',
  });
  input.value = value;
  const toggle = h('button', { type: 'button', class: 'icon-btn field-toggle', 'aria-label': 'Show password' }, icon('eye', 20));
  toggle.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    toggle.replaceChildren(icon(show ? 'eye-off' : 'eye', 20));
  });
  // The toggle must stay outside the <label>, or its text becomes part of the field's accessible name.
  const el = h('div', { class: 'field' }, h('label', { class: 'field-label', for: id }, label),
    h('span', { class: 'field-wrap' }, input, toggle), hint ? h('span', { class: 'field-hint' }, hint) : null);
  return { el, input };
}

export function installHint({ dismissed, onDismiss }) {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  if (!isIOS || standalone || dismissed || isNative()) return null;
  const el = h('div', { class: 'notice' },
    icon('share', 22),
    h('div', { class: 'notice-text' },
      h('b', null, 'Install on your iPhone'),
      h('span', null, 'Tap Share in Safari, then “Add to Home Screen”. It opens full-screen and works offline. Set up your vault in the installed app: logins saved in Safari are not copied over.')),
    h('button', { type: 'button', class: 'btn small ghost', onclick: () => { onDismiss(); el.remove(); } }, 'Got it'));
  return el;
}

/** A coloured badge with the portal's short code. */
export const badge = (portal, size = 'md') => h('span', { class: ['badge', size], style: { '--badge': portal.color }, 'aria-hidden': 'true' }, portal.short);
