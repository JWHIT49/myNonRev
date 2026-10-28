// Tiny DOM helpers. No framework, no innerHTML: every value reaches the page as text or as an attribute.
const SVG_NS = 'http://www.w3.org/2000/svg';

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** h('div', {class: 'x', onclick: fn, style: {'--w': '4px'}}, child, child...) */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const key of Object.keys(props)) {
      const v = props[key];
      if (v === undefined || v === null) continue;
      if (key.startsWith('aria-')) { el.setAttribute(key, String(v)); continue; }
      if (v === false) continue;
      if (key === 'class') el.className = Array.isArray(v) ? v.filter(Boolean).join(' ') : String(v);
      else if (key === 'style') {
        for (const [p, val] of Object.entries(v)) {
          if (p.startsWith('--')) el.style.setProperty(p, val);
          else el.style[p] = val;
        }
      } else if (key === 'dataset') Object.assign(el.dataset, v);
      else if (key.length > 2 && key.startsWith('on') && typeof v === 'function') el.addEventListener(key.slice(2).toLowerCase(), v);
      else if (v === true) el.setAttribute(key, '');
      else el.setAttribute(key, String(v));
    }
  }
  return append(el, children);
}

// 24x24 stroke icons. A spec is a path string, { c: [cx, cy, r] } or { r: [x, y, w, h, rx] }.
const ICONS = {
  plane: ['M22 2L11 13', 'M22 2l-7 20-4-9-9-4 20-7z'],
  home: ['M3.5 11.2L12 3.5l8.5 7.7', 'M5.5 9.8V20h4.5v-5.5h4V20h4.5V9.8'],
  bolt: ['M13 2.5L4.5 14H11l-1 7.5L19.5 10H13z'],
  sliders: ['M4 6h9', 'M17 6h3', { c: [15, 6, 2] }, 'M4 12h3', 'M11 12h9', { c: [9, 12, 2] }, 'M4 18h11', 'M19 18h1', { c: [17, 18, 2] }],
  lock: [{ r: [3.5, 11, 17, 10.5, 2] }, 'M7.5 11V7.5a4.5 4.5 0 0 1 9 0V11'],
  unlock: [{ r: [3.5, 11, 17, 10.5, 2] }, 'M7.5 11V7.5a4.5 4.5 0 0 1 8.6-1.8'],
  eye: ['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z', { c: [12, 12, 3] }],
  'eye-off': ['M17.9 17.9A10.3 10.3 0 0 1 12 19C5.6 19 2 12 2 12a18 18 0 0 1 5.1-5.9', 'M9.9 5.2A9 9 0 0 1 12 5c6.4 0 10 7 10 7a18 18 0 0 1-2.2 3.2', 'M2 2l20 20'],
  copy: [{ r: [9, 9, 12, 12, 2] }, 'M5 15H4a1.5 1.5 0 0 1-1.5-1.5V4A1.5 1.5 0 0 1 4 2.5h9.5A1.5 1.5 0 0 1 15 4v1'],
  external: ['M14 4h6v6', 'M20 4l-9 9', 'M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5'],
  'chevron-right': ['M9 5l7 7-7 7'],
  'chevron-left': ['M15 5l-7 7 7 7'],
  plus: ['M12 5v14', 'M5 12h14'],
  x: ['M6 6l12 12', 'M18 6L6 18'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  edit: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'],
  trash: ['M4 7h16', 'M9.5 7V4h5v3', 'M6 7l1 13h10l1-13'],
  download: ['M12 3.5v12', 'M7 11l5 5 5-5', 'M5 21h14'],
  upload: ['M12 16.5v-13', 'M7 8.5l5-5 5 5', 'M5 21h14'],
  refresh: ['M20 12a8 8 0 1 1-2.6-5.9', 'M20 4v5h-5'],
  share: ['M12 15V3.5', 'M8 7.5l4-4 4 4', 'M5 12v8h14v-8'],
  info: [{ c: [12, 12, 9] }, 'M12 11v5.5', 'M12 7.8h.01'],
  shield: ['M12 21.5s8-3.8 8-9.7V5.5L12 2.5 4 5.5v6.3c0 5.9 8 9.7 8 9.7z', 'M8.5 12l2.5 2.5 4.5-5'],
  key: [{ c: [7.5, 15.5, 4.5] }, 'M10.7 12.3L20.5 2.5', 'M16 7l3 3'],
  globe: [{ c: [12, 12, 9] }, 'M3 12h18', 'M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18'],
  moon: ['M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z'],
};

export function icon(name, size = 22, cls = '') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', `icon ${cls}`.trim());
  for (const spec of ICONS[name] ?? []) {
    let node;
    if (typeof spec === 'string') {
      node = document.createElementNS(SVG_NS, 'path');
      node.setAttribute('d', spec);
    } else if (spec.c) {
      node = document.createElementNS(SVG_NS, 'circle');
      node.setAttribute('cx', String(spec.c[0]));
      node.setAttribute('cy', String(spec.c[1]));
      node.setAttribute('r', String(spec.c[2]));
    } else if (spec.r) {
      node = document.createElementNS(SVG_NS, 'rect');
      const [x, y, w, hh, rx] = spec.r;
      node.setAttribute('x', x); node.setAttribute('y', y); node.setAttribute('width', w); node.setAttribute('height', hh); node.setAttribute('rx', rx);
    }
    if (node) svg.append(node);
  }
  return svg;
}
