import test from 'node:test';
import assert from 'node:assert/strict';
import { PORTALS, allPortals, getPortal, isBuiltin, normalizeUrl, shortCode, newCustomPortal } from '../js/portals.js';

test('built-in portals are well formed', () => {
  const ids = new Set();
  for (const p of PORTALS) {
    assert.ok(!ids.has(p.id), `duplicate id ${p.id}`);
    ids.add(p.id);
    assert.match(p.id, /^[a-z]+$/);
    assert.ok(p.name && p.short && p.subtitle);
    assert.match(p.color, /^#[0-9a-f]{6}$/i);
    assert.equal(new URL(p.url).protocol, 'https:');
    for (const step of p.navSteps) assert.doesNotThrow(() => new RegExp(step.text, 'i'), `${p.id}: ${step.text}`);
    if (p.doneWhen) assert.doesNotThrow(() => new RegExp(p.doneWhen, 'i'));
    if (p.extraField) assert.doesNotThrow(() => new RegExp(p.extraField.match, 'i'));
  }
  assert.deepEqual([...ids], ['american', 'delta', 'myidtravel', 'united', 'southwest']);
});

test('American keeps its two click-through steps in order', () => {
  const aa = getPortal(null, 'american');
  assert.deepEqual(aa.navSteps.map((s) => s.label), ['Regional Retiree Site', 'Travel Planner']);
  assert.ok(new RegExp(aa.navSteps[1].text, 'i').test('Travel Planner'));
  assert.ok(!new RegExp(aa.navSteps[1].text, 'i').test('Open the Travel Planner for details'));
  assert.ok(new RegExp(aa.navSteps[0].text, 'i').test('Regional Retiree Site >>'));
  assert.ok(!new RegExp(aa.navSteps[0].text, 'i').test('American Airlines Retiree Site'));
});

test('custom portals follow the built-ins and are flagged custom', () => {
  const custom = newCustomPortal({ name: 'Alaska Airlines', url: 'https://nonrev.example.com/', color: '#00796b' });
  const all = allPortals({ portals: [custom] });
  assert.equal(all.length, PORTALS.length + 1);
  assert.equal(all.at(-1).custom, true);
  assert.equal(getPortal({ portals: [custom] }, custom.id).name, 'Alaska Airlines');
  assert.equal(isBuiltin(custom.id), false);
  assert.equal(isBuiltin('delta'), true);
  assert.equal(custom.short, 'AA');
  assert.equal(custom.subtitle, 'nonrev.example.com');
});

test('normalizeUrl accepts web addresses and rejects everything else', () => {
  assert.equal(normalizeUrl('nonrev.example.com'), 'https://nonrev.example.com/');
  assert.equal(normalizeUrl('  https://a.example.com/x?y=1  '), 'https://a.example.com/x?y=1');
  assert.equal(normalizeUrl('http://a.example.com'), 'http://a.example.com/');
  for (const bad of ['', '   ', 'javascript:alert(1)', 'data:text/html,hi', 'ftp://a.example.com', 'file:///etc/passwd', 'notahost', 'https://']) {
    assert.equal(normalizeUrl(bad), null, bad);
  }
});

test('shortCode makes up to two capital letters', () => {
  assert.equal(shortCode('Alaska Airlines'), 'AA');
  assert.equal(shortCode('delta'), 'DE');
  assert.equal(shortCode('  '), '?');
});
