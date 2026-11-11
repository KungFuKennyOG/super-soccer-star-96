import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defenderTargets, keeperSave, mateDecision, keeperSpot, meet } from '../../rules/ai.js';
import { GOAL, AI } from '../../rules/tuning.js';
import { tuneFor } from '../../rules/skill.js';
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

test('keeper holds a hard shot struck straight at him but pushes the same one away at full stretch', () => {
  const gk = { x: 0 };
  assert.equal(keeperSave(gk, { x: 0.1, y: 1.1, t: 0.9, onTarget: true }, 26), 'catch');
  assert.equal(keeperSave(gk, { x: 1.9, y: 1.1, t: 0.9, onTarget: true }, 26), 'parry');
  assert.equal(keeperSave(gk, { x: 0.1, y: 1.1, t: 0.9, onTarget: true }, 30), 'parry', 'a rocket is still parried');
});

test('meeting a moving ball: straight at it with no read, onto its path with one', () => {
  const d = { x: 4, z: -20 }, ball = { x: 0, z: -14 };
  assert.deepEqual(meet(d, ball, 0, -7.6, 7, 0), { x: 0, z: -14 });
  const q = meet(d, ball, 0, -7.6, 7, 0.9);
  assert.ok(q.z < -17 && Math.abs(q.x) < 1e-9, 'somewhere down the line of the run');
  assert.ok(dist(d, q) <= 7 * ((ball.z - q.z) / 7.6) + 1e-6, 'and he can be there when the ball is');
  // too far to get there in time: where it'll be at the end of his read
  assert.deepEqual(meet({ x: 30, z: -20 }, ball, 0, -7.6, 7, 0.5), { x: 0, z: -14 - 7.6 * 0.5 });
});

test('HARD: the presser going in heads off your run instead of chasing the ball', () => {
  const run = [{ id: 'you', role: 'you', x: 0, z: -12, vx: 0, vz: -7.6 }, att[1], att[2]], ball = { x: 0, z: -12.6 };
  const ds = [{ id: 'd1', x: -7, z: -19 }, { id: 'd2', x: 1.8, z: -13 }, { id: 'd3', x: 7, z: -19 }];
  const normal = defenderTargets(ds, run, ball, 'you', tuneFor(3, 3, 0, 0).ai).get('d2');
  const hard = defenderTargets(ds, run, ball, 'you', tuneFor(3, 3, 0, 1).ai).get('d2');
  assert.ok(normal.in && hard.in);
  assert.deepEqual([normal.x, normal.z], [ball.x, ball.z]);
  assert.ok(hard.z < ball.z - 1, 'ahead of the ball, where he can meet it');
});

test('HARD: the spare man goes in once your run reaches him, but leaves a teammate on the ball to one man', () => {
  const ds = [{ id: 'd1', x: 0.5, z: -10.2 }, { id: 'd2', x: 0.5, z: -15 }, { id: 'd3', x: -9, z: -26 }];   // d1 presses from behind, d2 is spare
  const mk = role => [{ id: 'c', role, x: 0, z: -12, vx: 0, vz: -7 }, { id: 'a', role: 'mate', x: -10, z: -24 }, { id: 'b', role: 'mate', x: 12, z: -2 }];
  const ai = tuneFor(3, 3, 0, 1).ai, ball = { x: 0, z: -12.6 };
  const yours = defenderTargets(ds, mk('you'), ball, 'c', ai).get('d2');
  assert.equal(yours.role, 'cover'); assert.ok(yours.in, 'inside coverIn: in for the ball');
  const far = defenderTargets(ds.map(d => (d.id === 'd2' ? { ...d, z: -18 } : d)), mk('you'), ball, 'c', ai).get('d2');
  assert.ok(!far.in, 'further off he still stands off');
  assert.ok(!defenderTargets(ds, mk('mate'), ball, 'c', ai).get('d2').in, 'not for a teammate');
  assert.ok(!defenderTargets(ds, mk('you'), ball, 'c', tuneFor(3, 3, 0, 0).ai).get('d2').in, 'and never on NORMAL');
});

test('HARD: a beaten presser and a marker who has lost his man come back at a sprint', () => {
  const ai = tuneFor(3, 3, 0, 1).ai, base = tuneFor(3, 3, 0, 0).ai;
  const run = [{ id: 'you', role: 'you', x: 0, z: -20, vx: 0, vz: -7 }, { id: 'm1', role: 'mate', x: -6, z: -28 }, att[2]];
  const ds = [{ id: 'd1', x: 0, z: -17 }, { id: 'd2', x: 6, z: -20 }, { id: 'd3', x: 14, z: -12 }];
  const t = defenderTargets(ds, run, { x: 0, z: -20.6 }, 'you', ai), n = defenderTargets(ds, run, { x: 0, z: -20.6 }, 'you', base);
  assert.equal(t.get('d1').role, 'press');
  assert.ok(t.get('d1').speed > AI.chase && n.get('d1').speed === AI.press, 'the presser behind you');
  assert.equal(t.get('d2').role, 'mark');
  assert.ok(t.get('d2').speed > AI.chase && n.get('d2').speed === AI.mark, 'the marker metres off his man');
});
