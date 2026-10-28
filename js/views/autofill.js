// Autofill setup: install the bookmarklet that signs you in on the airline's own page.
import { h, icon } from '../dom.js';
import * as vault from '../vault.js';
import { bookmarkletUrl, newAutofillKey } from '../autofill/bookmarklet.js';
import { confirmSheet, toast } from '../ui.js';
import { copyText } from '../clip.js';
import * as router from '../router.js';

const step = (n, ...children) => h('li', { class: 'step' }, h('span', { class: 'step-n', 'aria-hidden': 'true' }, String(n)), h('div', { class: 'step-body' }, ...children));

async function setUp() {
  await vault.save((d) => { d.autofillKey = newAutofillKey(); });
  router.refresh();
}

async function resetKey() {
  const ok = await confirmSheet({
    title: 'Reset the autofill key?',
    message: 'This makes a new key and stops your current bookmark from working. You will need to install the bookmark again.',
    confirmLabel: 'Reset key', danger: true,
  });
  if (!ok) return;
  await setUp();
  toast('New key created. Install the bookmark again.');
}

export function autofillView() {
  const data = vault.snapshot();
  const key = data.autofillKey;

  const how = h('div', { class: 'card' },
    h('h3', null, icon('bolt', 18), 'How autofill works'),
    h('p', { class: 'muted' }, 'A web app cannot type into another site, so autofill uses a bookmark in Safari that runs on the airline’s page.'),
    h('ol', { class: 'plain-list' },
      h('li', null, 'Tap ', h('b', null, 'Sign in'), ' on a portal. myNonRev copies an encrypted login code and opens the site.'),
      h('li', null, 'On the airline page, tap the ', h('b', null, 'myNonRev'), ' bookmark. It reads the code, fills your username and password and clicks through.'),
      h('li', null, 'If the site moves to a new page part-way, tap the bookmark again. It carries on from there.')),
    h('p', { class: 'muted small' }, 'The code is encrypted with a key that only exists in your vault and your bookmark, and it expires after 5 minutes. Your password is never in the clipboard in readable form.'));

  if (!key) {
    return {
      title: 'Autofill', tab: 'autofill',
      el: h('div', { class: 'page' }, how,
        h('button', { type: 'button', class: 'btn primary block', onclick: setUp }, icon('bolt', 18), 'Set up autofill')),
    };
  }

  const url = bookmarkletUrl(key);
  const copyBtn = h('button', { type: 'button', class: 'btn primary block' }, icon('copy', 18), 'Copy bookmark code');
  copyBtn.addEventListener('click', async () => {
    const ok = await copyText(url);
    toast(ok ? 'Bookmark code copied. Now paste it into a bookmark (steps below).' : 'Could not copy. Press and hold the code box below to copy it.', { duration: 6000 });
  });
  const codeBox = h('textarea', { class: 'code-box', readonly: true, rows: 3, 'aria-label': 'Bookmark code', spellcheck: 'false' });
  codeBox.value = url;
  codeBox.addEventListener('focus', () => codeBox.select());

  // Desktop browsers: this link can be dragged to the bookmarks bar. (Clicking it here does nothing: the page forbids inline scripts.)
  const dragLink = h('a', { class: 'drag-link', href: url, draggable: 'true', onclick: (e) => e.preventDefault() }, icon('bolt', 16), 'myNonRev');

  return {
    title: 'Autofill', tab: 'autofill',
    el: h('div', { class: 'page' },
      how,
      h('div', { class: 'card' },
        h('h3', null, icon('plane', 18), 'Install the bookmark (once)'),
        h('p', { class: 'muted small' }, 'On iPhone or iPad, in Safari:'),
        h('ol', { class: 'steps' },
          step(1, 'Tap ', h('b', null, 'Copy bookmark code'), ' below.'),
          step(2, 'In Safari, open any page, tap ', h('b', null, 'Share'), ', then ', h('b', null, 'Add Bookmark'), '. Name it ', h('b', null, 'myNonRev'), ' and save.'),
          step(3, 'Open ', h('b', null, 'Bookmarks'), ' (the book icon), tap ', h('b', null, 'Edit'), ', then tap the myNonRev bookmark.'),
          step(4, 'Replace its address with the copied code (press and hold the address, choose ', h('b', null, 'Paste'), '), then tap ', h('b', null, 'Done'), '.')),
        copyBtn,
        h('details', { class: 'more' }, h('summary', null, 'Show the code'), codeBox),
        h('p', { class: 'muted small' }, 'On a computer, drag this to your bookmarks bar instead: ', dragLink)),
      h('div', { class: 'card' },
        h('h3', null, icon('info', 18), 'Good to know'),
        h('ul', { class: 'plain-list' },
          h('li', null, 'Use the bookmark in a normal ', h('b', null, 'Safari'), ' tab. Links opened from the home-screen app can appear in a small in-app viewer that has no Bookmarks: tap its Safari icon (or Share, then Open in Safari) first.'),
          h('li', null, 'The first time, Safari may ask you to allow Paste. That is the bookmark reading the login code.'),
          h('li', null, 'Airlines change their pages now and then. If a step stops working, sign in by hand using the copy buttons on the portal page.'))),
      h('button', { type: 'button', class: 'link-btn danger-text', onclick: resetKey }, 'Reset autofill key')),
  };
}
