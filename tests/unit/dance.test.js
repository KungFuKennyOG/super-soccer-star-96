import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDance, stepDance, poseFromHands, DANCE, beatLen } from '../../rules/dance.js';

const seq = () => { let i = 0; const v = [0.1, 0.4, 0.1, 0.7, 0.3, 0.9, 0.5, 0.2]; return () => v[i++ % v.length]; };

test('a dance has one move per beat after the count-in, never the same move twice in a row', () => {
  const d = createDance(seq());
  assert.equal(d.moves.length, DANCE.count);
  assert.ok(Math.abs(d.moves[0].t - DANCE.leadBeats * beatLen()) < 1e-9);
  for (let i = 1; i < d.moves.length; i++) assert.notEqual(d.moves[i].move, d.moves[i - 1].move);
});

test('hitting every pose on the beat is a full combo', () => {
  const d = createDance(seq());
  for (const m of d.moves) {
    stepDance(d, m.t - 0.5, null);
    const j = stepDance(d, m.t + 0.02, m.move);
    assert.equal(j[0].grade, 'perfect');
  }
  stepDance(d, d.end + 0.1, null);
  assert.ok(d.done);
  assert.equal(d.score, DANCE.count * DANCE.points.perfect + DANCE.fullCombo);
});

test('a late pose is good, a wrong or missing pose is a miss', () => {
  const d = createDance(seq());
  const m0 = d.moves[0];
  assert.equal(stepDance(d, m0.t + 0.15, m0.move)[0].grade, 'good');
  const m1 = d.moves[1];
  const wrong = m1.move === 'up' ? 'out' : 'up';
  assert.deepEqual(stepDance(d, m1.t, wrong), []);
  assert.equal(stepDance(d, m1.t + DANCE.window + 0.01, null)[0].grade, 'miss');
});

test('holding a pose from before the window does not count; you have to strike it', () => {
  const d = createDance(seq());
  const m = d.moves[0];
  assert.deepEqual(stepDance(d, m.t - 0.4, m.move), []);
  assert.deepEqual(stepDance(d, m.t, m.move), []);
  stepDance(d, m.t + 0.03, null);
  assert.equal(stepDance(d, m.t + 0.06, m.move)[0].grade, 'perfect');
});

test('poses from hand positions', () => {
  assert.equal(poseFromHands({ x: -0.2, y: 0.2 }, { x: 0.2, y: 0.25 }), 'up');
  assert.equal(poseFromHands({ x: -0.2, y: 0.2 }, { x: 0.2, y: -0.5 }), 'left');
  assert.equal(poseFromHands({ x: -0.2, y: -0.5 }, { x: 0.2, y: 0.3 }), 'right');
  assert.equal(poseFromHands({ x: -0.7, y: -0.2 }, { x: 0.7, y: -0.15 }), 'out');
  assert.equal(poseFromHands({ x: -0.2, y: -0.6 }, { x: 0.2, y: -0.6 }), null);
  assert.equal(poseFromHands(null, { x: 0, y: 0 }), null);
});
