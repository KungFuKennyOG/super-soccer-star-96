import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCup, currentFixture, playUser, scenarioFor, table, simScore, userGroup, CONTINUES } from '../../rules/cup.js';
import { byId } from '../../rules/teams.js';

const seeded = (s = 7) => () => (s = (s * 16807) % 2147483647) / 2147483647;

test('World Cup: 8 groups of 4, every nation once, one top-8 team per group', () => {
  const cup = createCup('world', 'CAN', seeded());
  assert.equal(cup.groups.length, 8);
  const all = cup.groups.flatMap(g => g.teams);
  assert.equal(new Set(all).size, 32);
  for (const g of cup.groups) {
    assert.equal(g.teams.length, 4);
    assert.equal(g.fixtures.length, 6);
    assert.ok(byId(g.teams[0]).s >= 4, `group ${g.id} has a seed`);
  }
  assert.equal(currentFixture(cup).stage, 'group');
});

test('Champions Cup: 16 clubs straight into a round of 16', () => {
  const cup = createCup('club', 'BAR', seeded());
  assert.equal(cup.rounds.r16.length, 8);
  assert.equal(new Set(cup.rounds.r16.flatMap(t => [t.a, t.b])).size, 16);
  assert.equal(currentFixture(cup).stage, 'r16');
});

test('winning every match: through the groups, the knockouts, and lifting the cup', () => {
  const cup = createCup('world', 'BRA', seeded(3));
  for (let i = 0; i < 3; i++) playUser(cup, 3, 0, seeded(i + 11));
  assert.equal(cup.stage, 'r16');
  assert.ok(userGroup(cup) && table(userGroup(cup))[0].id === 'BRA');
  const stages = [];
  let r;
  do { stages.push(currentFixture(cup).stage); r = playUser(cup, 2, 1, seeded(5)); } while (!r.champion);
  assert.deepEqual(stages, ['r16', 'qf', 'sf', 'final']);
  assert.ok(cup.done); assert.equal(cup.champion, 'BRA');
  assert.equal(currentFixture(cup), null);
});

test('group draws earn a point each', () => {
  const cup = createCup('world', 'JPN', seeded(9));
  playUser(cup, 1, 1, seeded(2));
  const row = table(userGroup(cup)).find(x => x.id === 'JPN');
  assert.equal(row.pts, 1); assert.equal(row.d, 1);
});

test('knockout losses spend continues, then you are out and the cup finishes without you', () => {
  const cup = createCup('club', 'GLA', seeded(4));
  for (let i = 0; i < CONTINUES; i++) {
    const r = playUser(cup, 0, 1);
    assert.ok(r.retry); assert.equal(cup.continues, CONTINUES - 1 - i);
    assert.equal(currentFixture(cup).stage, 'r16');
  }
  const r = playUser(cup, 1, 1, seeded(8));
  assert.ok(r.out); assert.ok(cup.done); assert.ok(cup.champion && cup.champion !== 'GLA');
});

test('scenarios start you behind with enough time, and knockouts need the win', () => {
  const cup = createCup('club', 'MAD', seeded(6));
  for (let i = 0; i < 50; i++) {
    const s = scenarioFor(cup, currentFixture(cup), seeded(i + 1));
    assert.ok(s.us < s.them && s.them - s.us <= 3);
    assert.ok(s.clock >= 110 && s.clock <= 180);
    assert.equal(s.need, 'win');
  }
});

test('stronger teams usually score more', () => {
  const rnd = seeded(12);
  let a = 0, b = 0;
  for (let i = 0; i < 400; i++) { const [x, y] = simScore(5, 1, rnd); a += x; b += y; }
  assert.ok(a > b * 2);
});

test('the match-length setting stretches the scenario clock', () => {
  const cup = createCup('club', 'MAD', seeded(6));
  const a = scenarioFor(cup, currentFixture(cup), seeded(3), 1), b = scenarioFor(cup, currentFixture(cup), seeded(3), 2.5);
  assert.equal(b.clock, Math.round(a.clock * 2.5));
  assert.ok(b.minute < a.minute && b.minute >= 1);
});
