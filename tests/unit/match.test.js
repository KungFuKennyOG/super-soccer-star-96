import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, scoreEvent, tickMatch, isTopBins, clockText } from '../../rules/match.js';

test('a top-corner worldie one-two scores every bonus', () => {
  const m = createMatch();
  const b = scoreEvent(m, { type: 'goal', x: 3.2, y: 2.0, dist: 26, by: 'you', assist: { from: 'm1' }, chain: 2 });
  assert.equal(b.text, 'TOP BINS!');
  assert.equal(m.points, 1000 + 750 + 500 + 300 + 200);
  assert.equal(m.goals, 1);
});

test('a plain goal scores 1000', () => {
  const m = createMatch();
  scoreEvent(m, { type: 'goal', x: 0, y: 0.5, dist: 12, by: 'you', assist: null, chain: 0 });
  assert.equal(m.points, 1000);
  assert.ok(!isTopBins({ x: 0, y: 0.5 }));
});

test('perfect passes pay a little; misses show a banner', () => {
  const m = createMatch();
  assert.equal(scoreEvent(m, { type: 'pass', by: 'you', grade: 'perfect' }).text, 'PERFECT');
  assert.equal(scoreEvent(m, { type: 'pass', by: 'you', grade: 'miss' }).text, 'SCUFFED IT');
  assert.equal(m.points, 50);
});

test('clock runs only in play; reset after a dead ball; over at zero', () => {
  const m = createMatch(1);
  tickMatch(m, 0.5, false, false); assert.equal(m.clock, 0.5);
  assert.equal(tickMatch(m, 1, true, false), null); assert.equal(m.clock, 0.5);
  assert.equal(tickMatch(m, 2, true, false), 'reset');
  assert.equal(tickMatch(m, 1, false, true), null);
  assert.equal(tickMatch(m, 0.1, false, false), 'over');
  assert.equal(clockText(83), '1:23');
});

import { isHatTrick } from '../../rules/match.js';
test('your third goal is a hat trick; teammates\' goals do not count toward it', () => {
  const m = createMatch();
  const g = by => { const e = { type: 'goal', x: 0, y: 0.5, dist: 12, by, assist: null, chain: 0 }; const b = scoreEvent(m, e); return { e, b }; };
  g('you'); g('m1');
  assert.ok(!isHatTrick(m, g('you').e));
  const third = g('you');
  assert.ok(isHatTrick(m, third.e));
  assert.equal(third.b.text, 'HAT TRICK!');
  assert.equal(m.goals, 4); assert.equal(m.yourGoals, 3);
});

import { createScenarioMatch, counterAttack, counterChance } from '../../rules/match.js';
test('cup matches keep the score: your goals add to yours, counters to theirs', () => {
  const m = createScenarioMatch({ us: 0, them: 2, clock: 145, oppStrength: 4 });
  assert.equal(m.clock, 145);
  const b = scoreEvent(m, { type: 'goal', x: 0, y: 0.5, dist: 12, by: 'm1', assist: null, chain: 0 });
  assert.equal(m.us, 1); assert.match(b.sub, /^1 - 2/);
  assert.ok(counterAttack(m, () => 0)); assert.equal(m.them, 3);
  assert.ok(!counterAttack(m, () => 0.99)); assert.equal(m.them, 3);
  assert.ok(counterChance(5) > counterChance(1));
  assert.ok(!counterAttack(createMatch(), () => 0), 'score attack has no counters');
});

test('a chip pays a bonus; claims and read drag-backs get their own banners', () => {
  const m = createMatch();
  const b = scoreEvent(m, { type: 'goal', by: 'you', kind: 'chip', x: 1, y: 1, dist: 11 });
  assert.equal(b.text, 'CHIP!');
  assert.equal(m.points, 1400);
  assert.equal(scoreEvent(m, { type: 'saved', claim: true }).text, 'CLAIMED');
  assert.equal(scoreEvent(m, { type: 'drag', read: true }).text, 'NOT AGAIN');
  assert.equal(scoreEvent(m, { type: 'drag' }), null);
});
