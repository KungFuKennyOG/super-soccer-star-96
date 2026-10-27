import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NATIONS, CLUBS, ALL, byId, kitsClash, awayKit, matchKit, keeperKit } from '../../rules/teams.js';

test('32 nations and 16 clubs with unique ids and sane fields', () => {
  assert.equal(NATIONS.length, 32);
  assert.equal(CLUBS.length, 16);
  assert.equal(new Set(ALL.map(t => t.id)).size, 48);
  for (const t of ALL) {
    assert.match(t.id, /^[A-Z]{3}$/);
    assert.ok(t.name.length <= 16, t.name);
    assert.ok(t.s >= 1 && t.s <= 5);
    for (const c of ['shirt', 'alt', 'shorts', 'socks', 'trim', 'number']) assert.match(t.kit[c], /^#[0-9a-f]{6}$/i, `${t.id} ${c}`);
  }
});

test('the London clubs are both in, Marseille is out', () => {
  assert.ok(byId('LDR') && byId('LDB'));
  assert.ok(!ALL.some(t => t.name === 'MARSEILLE'));
});

test('clashing kits are detected and the opponent changes', () => {
  const ger = byId('GER'), eng = byId('ENG'), ita = byId('ITA');
  assert.ok(kitsClash(ger.kit, eng.kit));
  assert.ok(!kitsClash(ger.kit, ita.kit));
  const k = matchKit(eng, ger);
  assert.ok(!kitsClash(k, ger.kit));
  assert.equal(matchKit(ita, ger), ita.kit);
});

test('change kits contrast with the home kit; keepers avoid green teams', () => {
  for (const t of ALL) assert.ok(!kitsClash(awayKit(t.kit), t.kit), t.id);
  assert.equal(keeperKit(byId('NGA').kit).shirt, '#e8c820');
  assert.equal(keeperKit(byId('BRA').kit).shirt, '#29a35a');
});

import { NATION_POS, nationToward } from '../../rules/teams.js';
test('every nation is on the map, and the stick moves to a sensible neighbour', () => {
  for (const n of NATIONS) assert.ok(NATION_POS[n.id], n.id);
  assert.equal(nationToward('FRA', 'down'), 'ESP');
  assert.equal(nationToward('ESP', 'left'), 'POR');
  assert.equal(nationToward('USA', 'up'), 'CAN');
  assert.equal(nationToward('BRA', 'down'), 'URU');
  assert.ok(['MEX', 'USA', 'CAN'].includes(nationToward('JPN', 'right')), 'wraps across the Pacific');
});

test('every nation can be reached from every other by moving the stick', () => {
  const seen = new Set(['CAN']), queue = ['CAN'];
  while (queue.length) {
    const id = queue.shift();
    for (const d of ['left', 'right', 'up', 'down']) { const n = nationToward(id, d); if (n && !seen.has(n)) { seen.add(n); queue.push(n); } }
  }
  assert.equal(seen.size, 32, [...NATIONS.map(n => n.id)].filter(x => !seen.has(x)).join(' '));
});
