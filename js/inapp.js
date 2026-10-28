// The in-app browser (native app only): the airline site opens inside myNonRev in a real web view, and the sign-in engine is injected into
// every page it loads, just like the old React Native WebView screen did.
import { plugin } from './native.js';
import { injectionScript } from './autofill/inject.js';

let active = null; // { id, handles }

async function dispose() {
  const current = active;
  active = null;
  if (!current) return;
  await Promise.all(current.handles.map((h) => h.remove().catch(() => {})));
}

/**
 * Opens the portal in the in-app browser. With a payload (the saved login) the engine runs on every page load, so multi-page sign-ins
 * carry on by themselves, and a toolbar button runs it again. Without one, the site just opens.
 */
export async function openInApp(portal, payload) {
  const browser = plugin('InAppBrowser');
  await dispose();
  const code = payload ? injectionScript(payload) : null;
  const state = { id: null, handles: [] };
  active = state;
  const run = (event) => {
    const target = event?.id ?? state.id;
    if (code && target) browser.executeScript({ id: target, code }).catch(() => {});
  };
  state.handles.push(
    await browser.addListener('browserPageLoaded', (event) => { if (!state.id || !event?.id || event.id === state.id) run(event); }),
    await browser.addListener('buttonNearDoneClick', (event) => run(event)),
    await browser.addListener('closeEvent', () => { if (active === state) dispose(); }),
  );
  const { id } = await browser.openWebView({
    url: portal.url,
    title: portal.name,
    toolbarType: 'navigation',
    showReloadButton: true,
    toolbarColor: '#0b1a3a',
    toolbarTextColor: '#ffffff',
    ...(code ? { buttonNearDone: { ios: { iconType: 'sf-symbol', icon: 'bolt.fill' } } } : {}),
  });
  state.id = id;
}
