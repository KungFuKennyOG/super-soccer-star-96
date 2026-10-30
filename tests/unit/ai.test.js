import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defenderTargets, keeperSave, mateDecision, keeperSpot } from '../../rules/ai.js';
import { GOAL } from '../../rules/tuning.js';
import { dist } from '../../rules/vec.js';

const defs = [{ id: 'd1', x: -7, z: -19 }, { id: 'd2', x: 0, z: -17 }, { id: 'd3', x: 7, z: -19 }];
const att = [{ id: 'you', x: 1, z: -10 }, { id: 'm1', x: -11, z: -12 }, { id: 'm2', x: 11, z: -12 }];

test('the defender nearest the carrier presses from the goal side; dangerous men are marked goal-side', () => {
  const t = defenderTargets(defs, att.map(a => ({ ...a, z: a.id === 'you' ? a.z : -20 })), { x: 1, z: -10.6 }, 'you');
  assert.equal(t.get('d2').role, 'press');
  assert.ok(t.get('d2').z < -10, 'goal-side of you');
  const m1 = t.get('d1'), m3 = t.get('d3');
  assert.equal(m1.role, 'mark'); assert.ok(m1.z < -20 && m1.x > -11);
  assert.equal(m3.role, 'mark'); assert.ok(m3.z < -20 && m3.x < 11);
});

test('a pass in flight: the defender nearest its receiver closes him down from behind, nobody chases the ball', () => {
  const recv = { id: 'm1', x: -11, z: -12 };
  const t = defenderTargets(defs, att, { x: -4, z: -11 }, null, undefined, recv);
  const p = [...t.values()].find(x => x.role === 'press');
  assert.ok(dist(p, recv) < 1.2 && p.x < recv.x, 'on the far side of him from the ball');
});

test('a teammate on the ball thinks: shoots in range, does not play a short pass into a defender', () => {
  const you = { x: 0, z: -15 };
  const mate = { x: 6, z: -15 };
  const inWay = [{ id: 'd', x: 3, z: -15 }];
  assert.equal(mateDecision(mate, inWay, 0.5, true, false, you), 'dribble');
  assert.equal(mateDecision(mate, [], 0.5, true, false, you), 'pass');
  assert.equal(mateDecision({ x: 1, z: GOAL.z + 8 }, [], 0.4, false, false, you), 'shoot');
});

test('keeper is beaten by a quick shot into the top corner, holds a soft central one', () => {
  const gk = { x: 0 };
  assert.equal(keeperSave(gk, { x: 3.3, y: 2.1, t: 0.6, onTarget: true }, 30), 'beaten');
  assert.equal(keeperSave(gk, { x: 0.5, y: 1, t: 1.2, onTarget: true }, 15), 'catch');
  assert.equal(keeperSave(gk, { x: 1.5, y: 1, t: 0.6, onTarget: true }, 28), 'parry');
  assert.equal(keeperSave(gk, { x: 6, y: 1, t: 0.6, onTarget: false }, 28), 'wide');
});

test('a teammate passes back when you call for it', () => {
  assert.equal(mateDecision({ x: -11, z: -12 }, defs, 0.5, true), 'pass');
  assert.equal(mateDecision({ x: -11, z: -12 }, [], 0.2, false), 'dribble');
  assert.equal(mateDecision({ x: 2, z: GOAL.z + 12 }, [], 0.8, false), 'shoot');
});

test('keeper stays between the posts and in front of the line', () => {
  const k = keeperSpot({ x: -20, z: -30 });
  assert.ok(Math.abs(k.x) < GOAL.halfW && k.z > GOAL.z);
});
