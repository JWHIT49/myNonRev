// Opening a portal. Must be called synchronously from a tap/click handler (the browser only allows opening a tab, and writing the
// clipboard, in direct response to the user).
import { h } from './dom.js';
import * as vault from './vault.js';
import { copyLazy } from './clip.js';
import { sealLoginCode, loginPayload } from './autofill/bookmarklet.js';
import { isNative } from './native.js';
import { openInApp } from './inapp.js';
import { toast } from './ui.js';

/** Can this portal sign in for you? In the native app any saved login can. In a browser it also needs the autofill bookmarklet set up. */
export function autofillReady(data, portalId) {
  return Boolean(data.creds[portalId]?.username) && (isNative() || Boolean(data.autofillKey));
}

function openTab(url) {
  // An anchor click counts as a user-initiated navigation everywhere (window.open is more often blocked in standalone mode).
  const a = h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' });
  document.body.append(a);
  a.click();
  a.remove();
}

async function openNative(portal, sign, data) {
  try {
    await openInApp(portal, sign ? loginPayload(portal, data.creds[portal.id]) : null);
  } catch (err) {
    console.warn('In-app browser failed', err);
    toast('Could not open the in-app browser. Opening the site in Safari instead.');
    openTab(portal.url);
  }
}

/**
 * Opens the portal's site. In the native app that is the in-app browser, signed in automatically. In a browser it opens a tab and, with
 * autofill set up, first puts an encrypted login code on the clipboard for the bookmarklet.
 */
export async function openPortal(portal, { autofill = true } = {}) {
  const data = vault.snapshot();
  const sign = autofill && autofillReady(data, portal.id);
  if (isNative()) { await openNative(portal, sign, data); return; }
  const copied = sign ? copyLazy(() => sealLoginCode(data.autofillKey, loginPayload(portal, data.creds[portal.id]))) : null;
  openTab(portal.url);
  if (!sign) return;
  toast((await copied)
    ? 'Login code copied. On the airline page, tap your myNonRev bookmark.'
    : 'Could not copy the login code. Use the copy buttons on the portal page instead.', { duration: 6000 });
}
