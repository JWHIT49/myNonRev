// Clipboard helpers. Passwords are wiped from the clipboard shortly after they are copied.
const CLEAR_AFTER_MS = 30_000;
const STALE_MS = 120_000; // never wipe something the user copied a while later

let timer = null;
let armed = false;
let armedAt = 0;

function legacyCopy(text) {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  area.setSelectionRange(0, text.length);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  area.remove();
  return ok;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return legacyCopy(text);
  }
}

/**
 * Copies text that is produced asynchronously (e.g. encrypted first). Safari only allows a clipboard write that starts inside the tap, so
 * the write is started immediately with a promise for its content.
 */
export async function copyLazy(makeText) {
  const textPromise = Promise.resolve().then(makeText);
  if (globalThis.ClipboardItem && navigator.clipboard?.write) {
    try {
      const blob = textPromise.then((t) => new Blob([t], { type: 'text/plain' }));
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })]);
      return true;
    } catch { /* fall back to a plain write below */ }
  }
  try { return await copyText(await textPromise); } catch { return false; }
}

async function clearNow() {
  if (!armed) return;
  if (Date.now() - armedAt > STALE_MS) { armed = false; return; }
  try {
    await navigator.clipboard.writeText('');
    armed = false;
  } catch { /* the page is not focused: try again when the user comes back */ }
}

/** Copies a secret and schedules wiping it from the clipboard. */
export async function copySecret(text) {
  const ok = await copyText(text);
  if (ok) {
    clearTimeout(timer);
    armed = true;
    armedAt = Date.now();
    timer = setTimeout(clearNow, CLEAR_AFTER_MS);
  }
  return ok;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && armed && Date.now() - armedAt >= CLEAR_AFTER_MS) clearNow();
});
