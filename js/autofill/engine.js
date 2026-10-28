// The autofill engine, ported from the RouteMe app. It is an adaptive state machine that:
//   1. fills the username field,
//   2. clicks Next/Continue if the password lives on a second step,
//   3. fills the password,
//   4. clicks Sign in / Log in,
//   5. then runs the portal's `nav` steps to click through to the page you actually use.
// It looks at what is on screen each tick instead of assuming a fixed sequence, so it is safe to run on any page of the sign-in flow.
//
// IMPORTANT: runAutofill is stringified into the bookmarklet (see bookmarklet.js), so it must stay completely self-contained:
// no imports, no references to anything outside its own body.
//
// payload: { u: username, p: password, n: portal name, nav: [{ text, label?, timeout? }], done: regex string,
//            extra: { label, match, value } | null }
export function runAutofill(payload, hooks) {
  var CREDS = { username: payload.u || '', password: payload.p || '' };
  var NAV = Array.isArray(payload.nav) ? payload.nav : [];
  var DONE_WHEN = payload.done || '';
  var EXTRA = payload.extra && payload.extra.value ? payload.extra : null;
  hooks = hooks || {};

  function log(m) { try { if (window.__MYNONREV_DEBUG__) console.log('[myNonRev] ' + m); } catch (e) { /* ignore */ } }

  if (window.__MYNONREV__ && window.__MYNONREV__.interval) { try { clearInterval(window.__MYNONREV__.interval); } catch (e) { /* ignore */ } }
  var S = window.__MYNONREV__ = {
    phase: CREDS.username ? 'login' : 'done', usernameFilled: false, passwordFilled: false, advancedClicked: false, submitClicked: false,
    extraStep: 0, extraTries: 0, extraWait: 0, extraDone: false, navIndex: 0, stepStart: Date.now(), last: 0, startedAt: Date.now(), interval: null,
  };

  var ACTION_DELAY = 500; // ms between actions; human-like pacing (not a hammer)
  var MAX_RUNTIME = 90000; // give up after 90s and let the user finish manually
  var GRACE_AUTHED = 4500; // if no login fields appear, assume an existing session
  var NEXT_RE = /(next|continue|proceed)/i;
  var LOGIN_RE = /(log ?in|sign ?in|submit|continue)/i;
  var AVOID_RE = /(forgot|reset|recover|help|trouble|google|apple|facebook|microsoft|okta|sso|register|create|cancel|enroll|new user)/i;

  function isVisible(el) {
    if (!el) return false;
    if (el.disabled) return false;
    var r; try { r = el.getBoundingClientRect(); } catch (e) { return false; }
    if (r.width <= 1 || r.height <= 1) return false;
    var st; try { st = window.getComputedStyle(el); } catch (e) { return true; }
    if (!st) return true;
    if (st.visibility === 'hidden' || st.display === 'none') return false;
    if (parseFloat(st.opacity || '1') === 0) return false;
    return true;
  }

  function txt(el) {
    try {
      var raw = el.innerText || el.textContent || el.value || (el.getAttribute ? el.getAttribute('aria-label') : '') || '';
      return (raw + '').replace(/\s+/g, ' ').trim();
    } catch (e) { return ''; }
  }

  function setNativeValue(el, value) {
    try {
      var proto = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
      var own = Object.getOwnPropertyDescriptor(el, 'value');
      if (proto && proto.set) { proto.set.call(el, value); }
      else if (own && own.set) { own.set.call(el, value); }
      else { el.value = value; }
    } catch (e) { try { el.value = value; } catch (e2) { /* ignore */ } }
    try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) { /* ignore */ }
    try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) { /* ignore */ }
    try { el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true })); } catch (e) { /* ignore */ }
  }

  function fill(el, value) { try { el.focus(); } catch (e) { /* ignore */ } setNativeValue(el, value); try { el.blur(); } catch (e) { /* ignore */ } }

  function findUsername() {
    if (!isLoginContext()) return null;
    var inputs = Array.prototype.slice.call(document.querySelectorAll('input'));
    var any = null;
    for (var i = 0; i < inputs.length; i++) {
      var el = inputs[i];
      var type = (el.type || 'text').toLowerCase();
      if (type === 'password' || type === 'hidden' || type === 'checkbox' || type === 'radio' || type === 'submit' || type === 'button' || type === 'file') continue;
      if (!isVisible(el)) continue;
      var hint = ((el.name || '') + ' ' + (el.id || '') + ' ' + (el.placeholder || '') + ' ' + (el.getAttribute('autocomplete') || '') + ' ' + (el.getAttribute('aria-label') || '')).toLowerCase();
      // Never treat a portal's extra field (e.g. myIDTravel's Employing Airline) as the username field.
      if (EXTRA && EXTRA.match) { try { if (new RegExp(EXTRA.match, 'i').test(hint)) continue; } catch (e) { /* ignore */ } }
      if (!any) any = el;
      if (/user|email|login|employee|account|userid|uid|member|number/.test(hint)) return el;
    }
    return any;
  }

  function findPassword() {
    var inputs = Array.prototype.slice.call(document.querySelectorAll('input[type=password]'));
    for (var i = 0; i < inputs.length; i++) { if (isVisible(inputs[i])) return inputs[i]; }
    return null;
  }

  // Gather descriptive text from a field and its nearby ancestors so we can identify floating-label fields (React/Material) whose
  // label is a separate element rather than a placeholder, e.g. myIDTravel's "Employing Airline".
  function fieldHint(el) {
    var t = (el.name || '') + ' ' + (el.id || '') + ' ' + (el.placeholder || '') + ' ' + (el.getAttribute('aria-label') || '');
    try { if (el.id) { var l = document.querySelector('label[for="' + el.id + '"]'); if (l) t += ' ' + (l.innerText || l.textContent || ''); } } catch (e) { /* ignore */ }
    var node = el;
    for (var d = 0; d < 3 && node; d++) {
      node = node.parentElement; if (!node) break;
      try {
        var labs = node.querySelectorAll ? node.querySelectorAll('label, legend, span') : [];
        for (var i = 0; i < labs.length && i < 8; i++) { t += ' ' + (labs[i].innerText || labs[i].textContent || ''); }
      } catch (e) { /* ignore */ }
    }
    return t.toLowerCase();
  }

  // Find the portal's optional extra field (e.g. an "Employing Airline" combobox) by matching EXTRA.match against the field's
  // attributes and nearby label text.
  function findExtraField() {
    if (!EXTRA || !EXTRA.value) return null;
    var re; try { re = new RegExp(EXTRA.match || EXTRA.label || '', 'i'); } catch (e) { re = /airline/i; }
    var els = Array.prototype.slice.call(document.querySelectorAll('input, select, [role=combobox], [role=listbox]'));
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (!isVisible(el)) continue;
      var type = (el.type || 'text').toLowerCase();
      if (type === 'password' || type === 'hidden' || type === 'checkbox' || type === 'radio' || type === 'submit' || type === 'button' || type === 'file') continue;
      if (re.test(fieldHint(el))) return el;
    }
    return null;
  }

  // The typable <input> for a combobox field (the element itself, or one within its container: React autocompletes wrap the input).
  function extraInput(el) {
    if (el.tagName === 'INPUT') return el;
    try { var a = el.querySelector ? el.querySelector('input') : null; if (a) return a; } catch (e) { /* ignore */ }
    try { var par = el.parentElement; var b = par && par.querySelector ? par.querySelector('input') : null; if (b) return b; } catch (e) { /* ignore */ }
    return null;
  }

  // Current display value of a combobox field (to detect an already-set airline).
  function comboValue(el) {
    if (el.tagName === 'SELECT') { try { return (el.options[el.selectedIndex] && el.options[el.selectedIndex].text) || ''; } catch (e) { return ''; } }
    var inp = extraInput(el); if (inp) return (inp.value || '');
    return txt(el);
  }

  // Choose an option in a native <select> whose text contains value.
  function selectNative(el, value) {
    var v = (value || '').toLowerCase();
    for (var i = 0; i < el.options.length; i++) {
      if (((el.options[i].text) || '').toLowerCase().indexOf(v) >= 0) { el.selectedIndex = i; try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) { /* ignore */ } return true; }
    }
    return false;
  }

  // Click the dropdown option whose text matches value (exact, else best prefix).
  function comboPick(value) {
    var v = (value || '').toLowerCase().trim();
    var opts = Array.prototype.slice.call(document.querySelectorAll('[role=option], [role=listbox] li, [class*=option], [class*=menu] li, [class*=dropdown] li, ul li'));
    var best = null;
    for (var i = 0; i < opts.length; i++) {
      var o = opts[i]; if (!isVisible(o)) continue;
      var t = txt(o).toLowerCase(); if (!t) continue;
      if (t === v) { clickEl(o); return true; }
      if (t.indexOf(v) === 0 && (!best || t.length < txt(best).length)) best = o;
    }
    if (best) { clickEl(best); return true; }
    return false;
  }

  // Dispatch a full key event sequence (React/MUI comboboxes often respond only to real keyboard events).
  function dispatchKey(el, key, code) {
    if (!el) return;
    var types = ['keydown', 'keypress', 'keyup'];
    for (var i = 0; i < types.length; i++) {
      try { el.dispatchEvent(new KeyboardEvent(types[i], { bubbles: true, cancelable: true, key: key, code: key, keyCode: code, which: code })); } catch (e) { /* ignore */ }
    }
  }

  // Commit a custom combobox via the keyboard: highlight the first filtered option (ArrowDown) then select it (Enter). More reliable
  // than clicking for many React autocomplete widgets, and it fixes the "typed but not selected" invalid state.
  function keyboardCommit(inp) {
    if (!inp) return;
    try { inp.focus(); } catch (e) { /* ignore */ }
    dispatchKey(inp, 'ArrowDown', 40);
    dispatchKey(inp, 'Enter', 13);
  }

  // True only when the current page actually looks like a login page. Stops the engine from typing credentials into ordinary app
  // fields, e.g. the "From" route box on the Travel Planner search page, which is just the first visible text input once signed in.
  function isLoginContext() {
    if (findPassword()) return true;
    var host = (location.hostname || '').toLowerCase();
    if (/login|signin|logon|sso|auth|idp|ping|okta/.test(host)) return true;
    var path = (location.pathname || '').toLowerCase();
    if (/login|signin|logon|auth/.test(path)) return true;
    return false;
  }

  function clickList() {
    return Array.prototype.slice.call(document.querySelectorAll('button, a[href], a[role], a[ng-click], input[type=submit], input[type=button], [role=button], [role=link]'));
  }

  function findButton(re, avoid) {
    var els = clickList();
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (!isVisible(el)) continue;
      var t = txt(el) || el.value || (el.getAttribute && el.getAttribute('aria-label')) || '';
      if (avoid && avoid.test(t)) continue;
      if (re.test(t)) return el;
    }
    return null;
  }

  function findSubmit() {
    var els = Array.prototype.slice.call(document.querySelectorAll('button[type=submit], input[type=submit], button'));
    for (var i = 0; i < els.length; i++) { if (isVisible(els[i])) return els[i]; }
    return null;
  }

  function clickEl(el) {
    try { el.scrollIntoView({ block: 'center' }); } catch (e) { /* ignore */ }
    try { el.focus(); } catch (e) { /* ignore */ }
    try { el.click(); } catch (e) { try { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); } catch (e2) { /* ignore */ } }
  }

  function findByText(pattern) {
    var re = null; try { re = new RegExp(pattern, 'i'); } catch (e) { re = null; }
    var els = clickList(); var match = null;
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (!isVisible(el)) continue;
      var t = txt(el);
      if (!t) continue;
      var ok = re ? re.test(t) : (t.toLowerCase().indexOf(String(pattern).toLowerCase()) >= 0);
      if (ok) { if (!match || t.length < txt(match).length) match = el; }
    }
    return match;
  }

  function stop() { try { if (S.interval) { clearInterval(S.interval); S.interval = null; } } catch (e) { /* ignore */ } }

  function banner(text) {
    try {
      var b = document.getElementById('mynonrev-banner');
      if (!b) {
        b = document.createElement('div'); b.id = 'mynonrev-banner';
        b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#0b1a3a;color:#fff;font:600 14px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;padding:10px 14px;display:flex;align-items:center;gap:10px;box-shadow:0 2px 10px rgba(0,0,0,.35)';
        var dot = document.createElement('span'); dot.style.cssText = 'width:9px;height:9px;border-radius:50%;background:#5aa9ff;flex:0 0 auto';
        var s = document.createElement('span'); s.id = 'mynonrev-banner-text'; s.style.cssText = 'flex:1 1 auto;line-height:1.3';
        var x = document.createElement('span'); x.textContent = '\u2715'; x.style.cssText = 'cursor:pointer;opacity:.65;padding:0 6px;flex:0 0 auto';
        x.onclick = function () { try { if (b && b.parentNode) b.parentNode.removeChild(b); } catch (e) { /* ignore */ } stop(); };
        b.appendChild(dot); b.appendChild(s); b.appendChild(x);
        (document.body || document.documentElement).appendChild(b);
      }
      var t = document.getElementById('mynonrev-banner-text'); if (t) t.textContent = 'myNonRev - ' + text;
    } catch (e) { /* ignore */ }
  }

  function fadeLater() {
    setTimeout(function () {
      try {
        var b = document.getElementById('mynonrev-banner');
        if (b) { b.style.transition = 'opacity .6s'; b.style.opacity = '0'; setTimeout(function () { if (b && b.parentNode) b.parentNode.removeChild(b); }, 800); }
      } catch (e) { /* ignore */ }
    }, 2500);
  }

  function finish(message) {
    S.phase = 'done'; banner(message); fadeLater(); stop();
    try { if (hooks.onDone) hooks.onDone(); } catch (e) { /* ignore */ }
  }

  // The earliest NAV step whose link is currently on the page (current step or any later one). Used both to know we still have
  // navigating to do and to skip the login wait on relay pages. Returns { i, el } or null.
  function firstNavTarget() {
    for (var i = 0; i < NAV.length; i++) { var el = findByText(NAV[i].text); if (el) return { i: i, el: el }; }
    return null;
  }

  function tick() {
    try {
      if (Date.now() - S.startedAt > MAX_RUNTIME) { banner('Auto sign-in timed out - finish manually'); stop(); return; }
      // Arrived at the destination app page: a cached or completed flow can land us here directly. Stop quietly so we never re-run
      // login or click stray links. Guarded so we DON'T finish on an intermediate page that shares the destination domain (e.g.
      // American's "Something went wrong" gate): only finish when no NAV link is on the page and we've given it a moment to render.
      if (DONE_WHEN && S.phase !== 'done') {
        try {
          if (new RegExp(DONE_WHEN, 'i').test(location.href) && !isLoginContext() && !firstNavTarget() && (Date.now() - S.startedAt > 1500)) {
            finish('Ready'); log('arrived at destination'); return;
          }
        } catch (e) { /* ignore */ }
      }
      if (Date.now() - S.last < ACTION_DELAY) return;

      if (S.phase === 'login') {
        var u = findUsername();
        var p = findPassword();

        // Optional extra field first (e.g. myIDTravel's Employing Airline). Custom dropdowns need open -> type -> click the matching
        // option, retried because options render asynchronously. Skipped when already set; the site usually remembers your last choice.
        if (EXTRA && EXTRA.value && !S.extraDone) {
          var ef = findExtraField();
          if (!ef) {
            S.extraWait++; S.last = Date.now();
            if (S.extraWait > 8) { S.extraDone = true; log('extra field not found; skipping'); }
            return;
          }
          if (ef.tagName === 'SELECT') { selectNative(ef, EXTRA.value); S.extraDone = true; S.last = Date.now(); banner('Selected ' + EXTRA.value); log('extra select set'); return; }
          // Only treat as already-set BEFORE we touch it, otherwise our own typed text would look like a committed value and we'd
          // skip selecting an option (leaving the field invalid).
          if (S.extraStep === 0 && comboValue(ef).toLowerCase().indexOf((EXTRA.value || '').toLowerCase()) >= 0) { S.extraDone = true; log('extra already set'); return; }
          if (S.extraStep === 0) { clickEl(ef); var ip0 = extraInput(ef); if (ip0) { try { ip0.focus(); } catch (e) { /* ignore */ } } S.extraStep = 1; S.last = Date.now(); banner('Opening ' + (EXTRA.label || 'airline')); log('extra opened'); return; }
          if (S.extraStep === 1) { var ip = extraInput(ef) || ef; try { ip.focus(); } catch (e) { /* ignore */ } setNativeValue(ip, EXTRA.value); dispatchKey(ip, 'ArrowDown', 40); S.extraStep = 2; S.last = Date.now(); banner('Entering ' + EXTRA.value); log('extra typed'); return; }
          // step 2+: commit an actual option: click the rendered match, else use keyboard selection (retried; options render async).
          if (comboPick(EXTRA.value)) { S.extraDone = true; S.last = Date.now(); banner('Selected ' + EXTRA.value); log('extra picked (click)'); return; }
          keyboardCommit(extraInput(ef) || ef);
          S.extraTries++; S.last = Date.now(); banner('Selecting ' + EXTRA.value); log('extra commit try ' + S.extraTries);
          if (S.extraTries > 6) { S.extraDone = true; log('extra commit finished'); }
          return;
        }

        if (!S.usernameFilled) {
          if (u) { fill(u, CREDS.username); S.usernameFilled = true; S.last = Date.now(); banner('Entered username'); log('username filled'); return; }
          // Fast path for relay pages: if we're clearly past login (not a login page) and a navigation link is already visible, go
          // straight to nav instead of waiting out the grace timer.
          if (!p && !isLoginContext() && NAV.length && firstNavTarget()) { S.phase = 'nav'; S.stepStart = Date.now(); S.last = Date.now(); banner('Opening route lookup...'); log('nav link visible; skipping login wait'); return; }
          // Otherwise wait briefly for fields to render: a short wait off login pages, the full grace on actual login pages.
          var grace = isLoginContext() ? GRACE_AUTHED : 1500;
          if (!p && Date.now() - S.startedAt > grace) { S.phase = 'nav'; S.stepStart = Date.now(); S.last = Date.now(); banner(NAV.length ? 'Opening route lookup...' : 'Already signed in'); log('no login fields, assume existing session'); return; }
          return;
        }
        if (p && !S.passwordFilled) { fill(p, CREDS.password); S.passwordFilled = true; S.last = Date.now(); banner('Entered password'); log('password filled'); return; }
        if (S.usernameFilled && !p && !S.passwordFilled && !S.advancedClicked) {
          var nb = findButton(NEXT_RE, AVOID_RE) || findSubmit();
          if (nb) { clickEl(nb); S.advancedClicked = true; S.last = Date.now(); banner('Continuing...'); log('clicked continue'); }
          return;
        }
        if (S.passwordFilled && !S.submitClicked) {
          var lb = findButton(LOGIN_RE, AVOID_RE) || findSubmit();
          if (lb) { clickEl(lb); S.submitClicked = true; S.last = Date.now(); banner('Signing in...'); log('clicked sign in'); }
          return;
        }
        if (S.submitClicked && !p && !u) { S.phase = 'nav'; S.stepStart = Date.now(); S.last = Date.now(); banner(NAV.length ? 'Opening route lookup...' : 'Signed in'); log('login complete'); return; }
        return;
      }

      if (S.phase === 'nav') {
        if (S.navIndex >= NAV.length) { finish('Ready'); return; }
        var step = NAV[S.navIndex];
        var target = findByText(step.text);
        if (target) { clickEl(target); log('nav: ' + (step.label || step.text)); S.navIndex++; S.stepStart = Date.now(); S.last = Date.now(); banner(step.label ? ('Opening ' + step.label) : 'Navigating...'); return; }
        // Cache-aware look-ahead: a cached session can skip an intermediate page. If the current step's link isn't here but a LATER
        // step's link already is, jump straight to it instead of waiting out the timeout.
        for (var k = S.navIndex + 1; k < NAV.length; k++) {
          var ahead = findByText(NAV[k].text);
          if (ahead) { clickEl(ahead); log('nav (skipped ahead): ' + (NAV[k].label || NAV[k].text)); S.navIndex = k + 1; S.stepStart = Date.now(); S.last = Date.now(); banner(NAV[k].label ? ('Opening ' + NAV[k].label) : 'Navigating...'); return; }
        }
        var to = step.timeout || 10000;
        if (Date.now() - S.stepStart > to) { log('nav skip (timeout): ' + (step.label || step.text)); S.navIndex++; S.stepStart = Date.now(); S.last = Date.now(); }
        return;
      }

      stop();
    } catch (e) { log('tick error: ' + ((e && e.message) || e)); }
  }

  if (!CREDS.username && !CREDS.password) {
    banner('No login saved for this site');
    fadeLater();
    return;
  }
  banner('Starting auto sign-in...');
  S.interval = setInterval(tick, 350);
  tick();
}
