// Login codes and the bookmarklet.
//
// A web app cannot type into another site, so autofill works through a bookmarklet that runs ON the airline page. The app hands the
// bookmarklet your login through the clipboard as a "login code": the credentials encrypted (AES-GCM) with a random key that exists only
// inside your vault and inside the bookmarklet you installed. Anything else that reads the clipboard sees only ciphertext, and the code
// stops working after five minutes.
import { b64url, unb64url, randomBytes } from '../crypto.js';
import { runAutofill } from './engine.js';

export const CODE_PREFIX = 'MNR1.';
export const CODE_TTL_MS = 5 * 60 * 1000;

export const newAutofillKey = () => b64url(randomBytes(32));

/** What the bookmarklet needs to sign in to one portal. */
export function loginPayload(portal, creds) {
  const ef = portal.extraField;
  const value = ef && creds.extra ? creds.extra[ef.key] : '';
  return {
    n: portal.name,
    u: creds.username || '',
    p: creds.password || '',
    nav: portal.navSteps ?? [],
    done: portal.doneWhen ?? '',
    extra: ef && value ? { label: ef.label, match: ef.match ?? ef.label, value } : null,
  };
}

export async function sealLoginCode(keyB64, payload, now = Date.now()) {
  const subtle = globalThis.crypto.subtle;
  const key = await subtle.importKey('raw', unb64url(keyB64), 'AES-GCM', false, ['encrypt']);
  const iv = randomBytes(12);
  const body = new TextEncoder().encode(JSON.stringify({ v: 1, exp: now + CODE_TTL_MS, ...payload }));
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, body));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return CODE_PREFIX + b64url(out);
}

// Runs inside the airline page as part of the bookmarklet, so (like runAutofill) it must stay self-contained.
export async function openLoginCode(text, keyB64, now) {
  var s = String(text).trim();
  if (s.indexOf('MNR1.') !== 0) throw new Error('That is not a myNonRev login code.');
  if (!(window.crypto && window.crypto.subtle)) throw new Error('This page cannot run secure code (it is not https).');
  function bytes(b64) {
    b64 = b64.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    var bin = atob(b64); var a = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return a;
  }
  var key = await crypto.subtle.importKey('raw', bytes(keyB64), 'AES-GCM', false, ['decrypt']);
  var raw = bytes(s.slice(5));
  var plain;
  try { plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, key, raw.slice(12)); }
  catch (e) { throw new Error('This login code was made with a different autofill key. Re-install the bookmark from the myNonRev Autofill tab.'); }
  var p = JSON.parse(new TextDecoder().decode(plain));
  if (!p || p.v !== 1) throw new Error('This login code is from a newer version of myNonRev.');
  if ((now || Date.now()) > p.exp) throw new Error('This login code has expired. Tap "Open & sign in" in myNonRev again.');
  return p;
}

// Drop comments and indentation to keep the bookmark small. Only the two functions above/below are passed through this, and they contain
// no multi-line strings or template literals, so line-based trimming is safe (newlines stay, so semicolon insertion is unchanged).
const compact = (src) => src
  .replace(/\/\*.*?\*\//g, '')
  .replace(/\s\/\/ .*$/gm, '')
  .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('//')).join('\n');

export function bookmarkletSource(keyB64) {
  return [
    '(async function(){try{',
    `var KEY=${JSON.stringify(keyB64)};`,
    `var openCode=${compact(openLoginCode.toString())};`,
    `var run=${compact(runAutofill.toString())};`,
    "var text='';",
    "try{text=await navigator.clipboard.readText();}catch(e){}",
    "text=(text||'').trim();",
    `if(text.indexOf(${JSON.stringify(CODE_PREFIX)})!==0){text=(prompt('myNonRev: paste your login code. (Tap Open & sign in in myNonRev first.)')||'').trim();}`,
    'if(!text)return;',
    'var p=await openCode(text,KEY);',
    "run(p,{onDone:function(){try{navigator.clipboard.writeText('').catch(function(){});}catch(e){}}});",
    "}catch(e){alert('myNonRev: '+(e&&e.message||e));}})()",
  ].join('\n');
}

/** The value for a bookmark's address field. */
export const bookmarkletUrl = (keyB64) => `javascript:void(${encodeURIComponent(bookmarkletSource(keyB64))})`;
