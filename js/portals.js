// Portal catalogue. Built-in portals are ported from the RouteMe app; you can add your own in the app (they are stored in the vault).
//
// navSteps: after sign-in, click through to the page you actually use. Each step clicks the first visible link/button whose text matches
// `text` (a case-insensitive regular expression). If a step's link is not found but a LATER step's link is already on screen, the engine
// jumps ahead, so leaving every step enabled is safe whether or not a cached session skips a page.
// doneWhen: once the page URL matches this regex (and no step is pending) the engine stops, so it never types into the search form.
// extraField: a second saved value some portals need on the login page (stored with the login, entered into a matching field).

export const PORTALS = [
  {
    id: 'american',
    name: 'American Airlines',
    short: 'AA',
    url: 'https://travelplanner.etp.aa.com/#!/',
    color: '#0078d2',
    subtitle: 'Employee Travel Planner (nonrev)',
    navSteps: [
      // "Something went wrong" gate: choose the Regional Retiree Site (not "Republic Airways Site" or "American Airlines Retiree Site").
      { text: 'regional\\s+retiree\\s+site', label: 'Regional Retiree Site', timeout: 12000 },
      // fly.aa.com portal: open Travel Planner. Anchored to the start of the link text so it matches the link, not the paragraph beneath.
      { text: '^\\s*travel\\s*planner', label: 'Travel Planner', timeout: 12000 },
    ],
    doneWhen: 'travelplanner\\.etp\\.aa\\.com',
  },
  {
    id: 'delta',
    name: 'Delta',
    short: 'DL',
    url: 'https://travelnet.delta.com/guest',
    color: '#c8102e',
    subtitle: 'TravelNet (nonrev)',
    navSteps: [],
  },
  {
    id: 'myidtravel',
    name: 'myIDTravel',
    short: 'ID',
    url: 'https://www.myidtravel.com/myidtravel/rui/login',
    color: '#1a1a6e',
    subtitle: 'Interline (ZED/myID) nonrev',
    navSteps: [],
    // myIDTravel needs an "Employing Airline" chosen alongside the login. Entered only when the field is empty (the site remembers it).
    extraField: { key: 'airline', label: 'Employing Airline', placeholder: 'e.g. Republic Airline', match: 'airline|employing' },
  },
  {
    id: 'united',
    name: 'United',
    short: 'UA',
    url: 'https://signon.ual.com/oamfed/idp/initiatesso?providerid=DPEmployeeRes',
    color: '#1414aa',
    subtitle: 'Employee Reservations (nonrev)',
    navSteps: [],
  },
  {
    id: 'southwest',
    name: 'Southwest',
    short: 'WN',
    url: 'https://nonrev.southwest.com/',
    color: '#304cb2',
    subtitle: 'Nonrevenue Travel',
    navSteps: [],
  },
];

export const COLORS = ['#0078d2', '#c8102e', '#1a1a6e', '#1414aa', '#304cb2', '#0d760c', '#9a5200', '#742774', '#00796b', '#455a64'];

const builtinIds = new Set(PORTALS.map((p) => p.id));

/** Built-in portals followed by the custom portals saved in the vault. */
export const allPortals = (data) => [...PORTALS, ...(data?.portals ?? []).map((p) => ({ ...p, custom: true, navSteps: [] }))];

export const getPortal = (data, id) => allPortals(data).find((p) => p.id === id) ?? null;

export const isBuiltin = (id) => builtinIds.has(id);

/** Returns a clean absolute http(s) URL, or null. Bare hosts like "nonrev.example.com" become https. */
export function normalizeUrl(input) {
  let text = String(input ?? '').trim();
  if (!text) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) text = `https://${text}`;
  try {
    const url = new URL(text);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (!url.hostname.includes('.') && url.hostname !== 'localhost') return null;
    return url.href;
  } catch {
    return null;
  }
}

export function shortCode(name) {
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  const code = words.length > 1 ? words.slice(0, 2).map((w) => w[0]).join('') : (words[0] ?? '?').slice(0, 2);
  return code.toUpperCase();
}

export function newCustomPortal({ name, url, color }) {
  const clean = String(name).trim();
  return {
    id: `c-${globalThis.crypto.randomUUID().slice(0, 8)}`,
    name: clean,
    short: shortCode(clean),
    url,
    color: color || COLORS[0],
    subtitle: new URL(url).hostname,
  };
}
