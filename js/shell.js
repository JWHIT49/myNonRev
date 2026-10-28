// The app frame: one top bar, one scrolling view, a tab bar. Views hand over a descriptor:
//   { el, title, subtitle?, back? (href | fn), actions?: [{icon,label,href|onClick}], tab? ('home'|'autofill'|'settings'), bare? (no chrome),
//     onMount?, onLeave? }
import { h, icon } from './dom.js';
import { closeAllSheets } from './ui.js';
import { isNative } from './native.js';

// The bookmarklet setup is only needed in a browser: the native app signs in inside its own browser.
const TABS = [['home', 'Portals', 'plane', '#/'], ['autofill', 'Autofill', 'bolt', '#/autofill'], ['settings', 'Settings', 'sliders', '#/settings']]
  .filter(([id]) => !(isNative() && id === 'autofill'));
let current = null;

const $ = (id) => document.getElementById(id);

function leave() {
  if (current?.onLeave) {
    try { current.onLeave(); } catch (err) { console.error(err); }
  }
  current = null;
}

function actionEl(a) {
  const props = { class: 'icon-btn', 'aria-label': a.label, title: a.label };
  const content = a.icon ? icon(a.icon, 22) : a.text;
  return a.href ? h('a', { ...props, href: a.href }, content) : h('button', { ...props, type: 'button', onclick: a.onClick }, content);
}

function renderTop(view) {
  const bar = $('topbar');
  bar.hidden = Boolean(view.bare);
  if (view.bare) return;
  let left;
  if (typeof view.back === 'function') left = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Back', onclick: view.back }, icon('chevron-left', 26));
  else if (view.back) left = h('a', { class: 'icon-btn', href: view.back, 'aria-label': 'Back' }, icon('chevron-left', 26));
  else left = h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, icon('plane', 22));
  bar.replaceChildren(h('div', { class: 'top-row' },
    left,
    h('div', { class: 'top-title' }, h('div', { class: 'top-main' }, view.title ?? ''), view.subtitle ? h('div', { class: 'top-sub' }, view.subtitle) : null),
    h('div', { class: 'top-actions' }, ...(view.actions ?? []).map(actionEl))));
}

function renderTabs(view) {
  const nav = $('tabbar');
  if (!view.tab || view.bare) { nav.hidden = true; nav.replaceChildren(); return; }
  nav.hidden = false;
  nav.replaceChildren(...TABS.map(([id, label, ic, href]) => h('a', {
    class: ['tab', view.tab === id && 'active'], href, 'aria-current': view.tab === id ? 'page' : null,
  }, icon(ic, 24), h('span', null, label))));
}

function messageView(title, text) {
  return {
    title: 'myNonRev', tab: 'home',
    el: h('div', { class: 'page' }, h('div', { class: 'empty' }, icon('info', 36), h('h3', null, title), h('p', { class: 'muted' }, text),
      h('a', { class: 'btn primary', href: '#/' }, 'Back to portals'))),
  };
}

export function mount(view) {
  closeAllSheets();
  if (!view || view.notFound) view = messageView('Page not found', 'That page does not exist.');
  else if (view.error) {
    console.error(view.error);
    view = messageView('Something went wrong', view.error.message || String(view.error));
  }
  leave();
  current = view;
  const main = $('view');
  main.className = 'view';
  main.replaceChildren(view.el);
  renderTop(view);
  renderTabs(view);
  document.title = view.title && view.title !== 'myNonRev' && !view.bare ? `${view.title} · myNonRev` : 'myNonRev';
  main.scrollTop = 0;
  if (!view.noFocus) main.focus({ preventScroll: true });
  view.onMount?.(main);
}

export const scroller = () => $('view');
