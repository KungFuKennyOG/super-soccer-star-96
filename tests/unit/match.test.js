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
