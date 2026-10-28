// Opening a portal. Must be called synchronously from a tap/click handler (the browser only allows opening a tab, and writing the
// clipboard, in direct response to the user).
import { h } from './dom.js';
import * as vault from './vault.js';
import { copyLazy } from './clip.js';
import { sealLoginCode, loginPayload } from './autofill/bookmarklet.js';
import { toast } from './ui.js';

export function autofillReady(data, portalId) {
  return Boolean(data.autofillKey && data.creds[portalId]?.username);
}

function openTab(url) {
  // An anchor click counts as a user-initiated navigation everywhere (window.open is more often blocked in standalone mode).
  const a = h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' });
  document.body.append(a);
  a.click();
  a.remove();
}

/** Opens the portal's site; with autofill set up, first puts an encrypted login code on the clipboard for the bookmarklet. */
export async function openPortal(portal, { autofill = true } = {}) {
  const data = vault.snapshot();
  const sign = autofill && autofillReady(data, portal.id);
  const copied = sign ? copyLazy(() => sealLoginCode(data.autofillKey, loginPayload(portal, data.creds[portal.id]))) : null;
  openTab(portal.url);
  if (!sign) return;
  toast((await copied)
    ? 'Login code copied. On the airline page, tap your myNonRev bookmark.'
    : 'Could not copy the login code. Use the copy buttons on the portal page instead.', { duration: 6000 });
}
