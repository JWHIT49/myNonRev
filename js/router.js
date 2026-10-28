// Hash router: '#/p/delta/edit' -> handler({ params, query, path }).
// A handler returns a view descriptor (see shell.js) or { redirect: '/path' }, and may be async. A guard can replace any view (used for
// the lock screen).
const table = [];
let render = () => {};
let guard = () => null;
let token = 0;

export function on(pattern, handler) {
  const keys = [];
  const source = pattern.replace(/:[A-Za-z]+/g, (m) => { keys.push(m.slice(1)); return '([^/]+)'; });
  table.push({ re: new RegExp(`^${source}/?$`), keys, handler });
}

export function setGuard(fn) { guard = fn; }

export function parse() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const q = raw.indexOf('?');
  const path = q < 0 ? raw : raw.slice(0, q);
  return { path: path || '/', query: new URLSearchParams(q < 0 ? '' : raw.slice(q + 1)) };
}

export const go = (path, { replace = false } = {}) => {
  if (replace) location.replace(`#${path}`);
  else location.hash = path;
};

export async function refresh() {
  const mine = ++token;
  const { path, query } = parse();
  const guarded = guard();
  if (guarded) { render(guarded); return; }
  for (const route of table) {
    const m = route.re.exec(path);
    if (!m) continue;
    const params = {};
    route.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
    let view;
    try { view = await route.handler({ params, query, path }); } catch (error) { view = { error }; }
    if (mine !== token) return;
    if (view?.redirect) { go(view.redirect, { replace: true }); return; }
    render(view);
    return;
  }
  render({ notFound: true });
}

export function start(mount) {
  render = mount;
  addEventListener('hashchange', refresh);
  return refresh();
}
